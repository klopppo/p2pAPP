-- SIWE / GoTrue claim-path fix.
--
-- WHY: the platform GoTrue mints its JWTs with `user_metadata` (and
-- `wallet_address` inside it) as a NESTED bag, not as a top-level custom
-- claim. The SIWE RLS layer (20260829000002 / 20260824000006 /
-- 20260830000001) read `auth.jwt() ->> 'wallet_address'` at top level, which
-- is always NULL for a real GoTrue-issued session — silently locking every
-- wallet-scoped policy. There is no platform switch to flatten custom claims
-- (config API exposes none), so the RLS reads the nested path instead.
--
-- Idempotent: `create or replace` + drop/recreate policy.

-- ---------------------------------------------------------------------------
-- 1. current_user_id() — resolve the session wallet from the GoTrue JWT
--    `user_metadata` bag (produced by siwe-auth v2), with a top-level
--    fallback for legacy/custom tokens.
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
    auth.jwt() -> 'user_metadata' ->> 'wallet_address',
    auth.jwt() ->> 'wallet_address',
    ''
  ))
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 2. USERS self-scope policies — same nested-path fix for the policies that
--    compare the wallet claim directly (not via current_user_id()).
-- ---------------------------------------------------------------------------

drop policy if exists "users_insert_self" on public.users;
create policy "users_insert_self"
  on public.users for insert
  to authenticated
  with check (
    wallet_address = lower(coalesce(
      auth.jwt() -> 'user_metadata' ->> 'wallet_address',
      auth.jwt() ->> 'wallet_address',
      ''
    ))
  );

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self"
  on public.users for update
  to authenticated
  using (
    wallet_address = lower(coalesce(
      auth.jwt() -> 'user_metadata' ->> 'wallet_address',
      auth.jwt() ->> 'wallet_address',
      ''
    ))
  )
  with check (
    wallet_address = lower(coalesce(
      auth.jwt() -> 'user_metadata' ->> 'wallet_address',
      auth.jwt() ->> 'wallet_address',
      ''
    ))
  );