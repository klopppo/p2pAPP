-- SECURITY: move the SIWE wallet claim from `user_metadata` to `app_metadata`.
--
-- WHY: `current_user_id()` (and six policies) authorized off
-- `auth.jwt() -> 'user_metadata' ->> 'wallet_address'`. GoTrue lets ANY signed-in
-- user rewrite their own `user_metadata` (`supabase.auth.updateUser({ data: {
-- wallet_address: <victim> } })`), after which the freshly-minted JWT carries
-- the victim's wallet and every wallet-scoped policy trusts it. That is full
-- wallet impersonation (trades, messages, offers, avatars, notifications…).
--
-- `app_metadata` is admin-only: only the service-role client can set it, so the
-- claim can no longer be forged by the authenticated user. The `siwe-auth`
-- edge function now writes `app_metadata.wallet_address` on every verify.
--
-- NOTE: sessions minted before this migration carry only the (untrusted)
-- `user_metadata` claim, so they resolve to NULL until the next token refresh /
-- re-sign. That is intentional — the server must not trust a user-writable bag.

-- ---------------------------------------------------------------------------
-- 1. current_user_id() — resolve the session wallet from `app_metadata` only.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.wallet_address = lower(coalesce(
    auth.jwt() -> 'app_metadata' ->> 'wallet_address',
    ''
  ))
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 2. USERS self-scope policies.
-- ---------------------------------------------------------------------------
drop policy if exists "users_insert_self" on public.users;
create policy "users_insert_self"
  on public.users for insert
  to authenticated
  with check (
    wallet_address = lower(coalesce(
      auth.jwt() -> 'app_metadata' ->> 'wallet_address',
      ''
    ))
  );

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self"
  on public.users for update
  to authenticated
  using (
    wallet_address = lower(coalesce(
      auth.jwt() -> 'app_metadata' ->> 'wallet_address',
      ''
    ))
  )
  with check (
    wallet_address = lower(coalesce(
      auth.jwt() -> 'app_metadata' ->> 'wallet_address',
      ''
    ))
  );

-- ---------------------------------------------------------------------------
-- 3. Private offers — target matched against the admin-only claim.
-- ---------------------------------------------------------------------------
drop policy if exists "offers_select_private_parties" on public.offers;
create policy "offers_select_private_parties"
  on public.offers for select
  to authenticated
  using (
    is_private = true
    and (
      seller_id = public.current_user_id()
      or lower(target_user) = lower(coalesce(
        auth.jwt() -> 'app_metadata' ->> 'wallet_address',
        ''
      ))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Avatars storage policies.
-- ---------------------------------------------------------------------------
drop policy if exists "avatars_self_write"  on storage.objects;
drop policy if exists "avatars_self_update" on storage.objects;

create policy "avatars_self_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '-', 1) = lower(coalesce(
      auth.jwt() -> 'app_metadata' ->> 'wallet_address',
      ''
    ))
    and name <> ''
  );

create policy "avatars_self_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '-', 1) = lower(coalesce(
      auth.jwt() -> 'app_metadata' ->> 'wallet_address',
      ''
    ))
    and name <> ''
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '-', 1) = lower(coalesce(
      auth.jwt() -> 'app_metadata' ->> 'wallet_address',
      ''
    ))
    and name <> ''
  );

-- ---------------------------------------------------------------------------
-- 5. RBAC helpers — drop the legacy top-level `wallet_address` term (never set
--    by GoTrue) and read the admin-only claim for the wallet fallback.
-- ---------------------------------------------------------------------------
create or replace function public.current_operator_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from public.sys_operators o
  where o.status = 'ACTIVE'
    and (
      o.user_id = public.current_user_id()
      or lower(coalesce(o.wallet_address, '')) = lower(coalesce(
        auth.jwt() -> 'app_metadata' ->> 'wallet_address', ''
      ))
    )
  limit 1;
$$;

create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sys_operators o
    where o.status = 'ACTIVE'
      and (
        o.user_id = public.current_user_id()
        or lower(coalesce(o.wallet_address, '')) = lower(coalesce(
          auth.jwt() -> 'app_metadata' ->> 'wallet_address', ''
        ))
      )
  );
$$;

create or replace function public.operator_has_permission(
  p_program   varchar,
  p_permission varchar
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sys_operators o
    join public.sys_operator_roles sor  on sor.operator_id = o.id
    join public.sys_roles         r    on r.id = sor.role_id
    where o.status = 'ACTIVE'
      and (
        o.user_id = public.current_user_id()
        or lower(coalesce(o.wallet_address, '')) = lower(coalesce(
          auth.jwt() -> 'app_metadata' ->> 'wallet_address', ''
        ))
      )
      and (
        r.id = 'SUPER_ADMIN'
        or exists (
          select 1 from public.sys_program_role_permissions prp
          where prp.program_id = p_program
            and prp.role_id    = r.id
            and prp.permission_id = p_permission
        )
      )
  );
$$;
