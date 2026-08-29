-- Wallet-authenticated RLS rewrite (Security P1).
--
-- Every table the app touches is moved off the permissive
-- "to anon, authenticated using (true)" posture onto real authorization
-- backed by the JWT minted by the `siwe-auth` edge function.
--
-- Identity model (wallet-primary):
--   RLS does NOT key on auth.uid(). Policies call `public.current_user_id()`,
--   which resolves the JWT's custom claim `wallet_address` to the matching
--   `users.id`. This keeps pre-existing `users` rows (arbitrary uuids) fully
--   compatible — no data migration is required.
--
-- ⚠️ DEPLOY ORDER (breaking):
--   1. `supabase functions deploy siwe-auth --no-verify-jwt`
--   2. `supabase db push` (this file)
--   3. deploy the client (it now signs in via `siwe-auth`)
--   4. test SIGN-IN + one full trade flow on staging first.
--
-- After this migration anon can still READ (marketplace + profiles) but can
-- WRITE nothing. Any write requires a signed-in session. This is the intended
-- cutover.
--
-- Idempotent: policies are dropped by name and recreated on every run.

-- =====================================================================
-- 1. Service-only tables for the edge function.
--    RLS is ENABLED with NO policies: the service-role client (the table
--    owner) bypasses RLS; anon/authenticated can never touch them.
-- =====================================================================

create table if not exists public.siwe_nonces (
  nonce      text primary key,
  address    text not null,
  created_at timestamptz not null default now(),
  used_at    timestamptz
);

create index if not exists idx_siwe_nonces_address
  on public.siwe_nonces(address, created_at);

alter table public.siwe_nonces enable row level security;

create table if not exists public.siwe_auth_links (
  wallet_address text primary key,
  auth_user_id   uuid not null,
  created_at     timestamptz not null default now()
);

alter table public.siwe_auth_links enable row level security;

-- =====================================================================
-- 2. Identity helpers (security definer so the policy subquery can't recurse
--    into the same table it protects; the owner bypasses RLS).
-- =====================================================================

-- Resolves the active session's wallet claim to the platform users.id. NULL
-- when there is no session (or the claimed wallet has no users row) — which
-- makes every write policy deny, which is the intended posture.
create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.wallet_address = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
  limit 1;
$$;

create or replace function public.is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = p_user_id
  );
$$;

-- =====================================================================
-- 3. USERS — profiles stay world-readable (needed for every join + profile
--    page). Writes are self-scoped to the signed-in wallet.
-- =====================================================================

drop policy if exists "users_insert_any" on public.users;
drop policy if exists "users_update_any" on public.users;
drop policy if exists "users_select_any" on public.users;

create policy "users_select_public"
  on public.users for select
  to anon, authenticated
  using (true);

create policy "users_insert_self"
  on public.users for insert
  to authenticated
  with check (wallet_address = lower(auth.jwt() ->> 'wallet_address'));

create policy "users_update_self"
  on public.users for update
  to authenticated
  using (wallet_address = lower(auth.jwt() ->> 'wallet_address'))
  with check (wallet_address = lower(auth.jwt() ->> 'wallet_address'));

-- =====================================================================
-- 4. OFFERS — public read (marketplace), owner-scoped write.
-- =====================================================================

drop policy if exists "offers_insert_any" on public.offers;
drop policy if exists "offers_update_any" on public.offers;
drop policy if exists "offers_select_any" on public.offers;

create policy "offers_select_public"
  on public.offers for select
  to anon, authenticated
  using (true);

create policy "offers_insert_owner"
  on public.offers for insert
  to authenticated
  with check (seller_id = public.current_user_id());

create policy "offers_update_owner"
  on public.offers for update
  to authenticated
  using (seller_id = public.current_user_id())
  with check (seller_id = public.current_user_id());

-- =====================================================================
-- 5. TRADES + TRADE EVENTS — parties only.
-- =====================================================================

drop policy if exists "trades_select_any" on public.trades;
drop policy if exists "trades_insert_any" on public.trades;
drop policy if exists "trades_update_any" on public.trades;

create policy "trades_select_parties"
  on public.trades for select
  to authenticated
  using (buyer_id = public.current_user_id() or seller_id = public.current_user_id());

create policy "trades_insert_parties"
  on public.trades for insert
  to authenticated
  with check (buyer_id = public.current_user_id() or seller_id = public.current_user_id());

create policy "trades_update_parties"
  on public.trades for update
  to authenticated
  using (buyer_id = public.current_user_id() or seller_id = public.current_user_id())
  with check (buyer_id = public.current_user_id() or seller_id = public.current_user_id());

drop policy if exists "trade_events_insert_any" on public.trade_events;

create policy "trade_events_select_parties"
  on public.trade_events for select
  to authenticated
  using (exists (
    select 1 from public.trades t
    where t.id = trade_id
      and (t.buyer_id = public.current_user_id() or t.seller_id = public.current_user_id())
  ));

create policy "trade_events_insert_parties"
  on public.trade_events for insert
  to authenticated
  with check (exists (
    select 1 from public.trades t
    where t.id = trade_id
      and (t.buyer_id = public.current_user_id() or t.seller_id = public.current_user_id())
  ));

-- =====================================================================
-- 6. CHAT — conversations/participants/messages/attachments are readable by
--    conversation participants; writes are self-scoped + participant-bound.
-- =====================================================================

drop policy if exists "conversations_all" on public.conversations;
create policy "conversations_read_participant"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_participant(id, public.current_user_id()));

create policy "conversations_update_participant"
  on public.conversations for update
  to authenticated
  using (public.is_conversation_participant(id, public.current_user_id()))
  with check (public.is_conversation_participant(id, public.current_user_id()));

drop policy if exists "conv_participants_all" on public.conversation_participants;
create policy "conv_participants_read_participant"
  on public.conversation_participants for select
  to authenticated
  using (public.is_conversation_participant(conversation_id, public.current_user_id()));

create policy "conv_participants_insert_self"
  on public.conversation_participants for insert
  to authenticated
  with check (user_id = public.current_user_id());

create policy "conv_participants_update_self"
  on public.conversation_participants for update
  to authenticated
  using (public.is_conversation_participant(conversation_id, public.current_user_id()))
  with check (user_id = public.current_user_id());

create policy "conv_participants_delete_self"
  on public.conversation_participants for delete
  to authenticated
  using (user_id = public.current_user_id());

drop policy if exists "messages_all" on public.messages;
create policy "messages_read_participant"
  on public.messages for select
  to authenticated
  using (public.is_conversation_participant(conversation_id, public.current_user_id()));

create policy "messages_insert_participant"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = public.current_user_id()
    and public.is_conversation_participant(conversation_id, public.current_user_id())
  );

create policy "messages_update_own"
  on public.messages for update
  to authenticated
  using (sender_id = public.current_user_id())
  with check (sender_id = public.current_user_id());

create policy "messages_delete_own"
  on public.messages for delete
  to authenticated
  using (sender_id = public.current_user_id());

drop policy if exists "message_attachments_all" on public.message_attachments;
create policy "message_attachments_read_participant"
  on public.message_attachments for select
  to authenticated
  using (public.is_conversation_participant(
    (select conversation_id from public.messages where id = message_attachments.id),
    public.current_user_id()
  ));

create policy "message_attachments_insert_own"
  on public.message_attachments for insert
  to authenticated
  with check (uploaded_by = public.current_user_id());

-- =====================================================================
-- 7. NOTIFICATIONS + PREFS — own rows only.
-- =====================================================================

drop policy if exists "notifications_all" on public.notifications;
create policy "notifications_read_own"
  on public.notifications for select
  to authenticated
  using (user_id = public.current_user_id());

create policy "notifications_insert_own"
  on public.notifications for insert
  to authenticated
  with check (user_id = public.current_user_id());

create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (user_id = public.current_user_id());

drop policy if exists "notif_prefs_all" on public.notification_preferences;
create policy "notif_prefs_read_own"
  on public.notification_preferences for select
  to authenticated
  using (user_id = public.current_user_id());

create policy "notif_prefs_insert_own"
  on public.notification_preferences for insert
  to authenticated
  with check (user_id = public.current_user_id());

create policy "notif_prefs_update_own"
  on public.notification_preferences for update
  to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

create policy "notif_prefs_delete_own"
  on public.notification_preferences for delete
  to authenticated
  using (user_id = public.current_user_id());

-- =====================================================================
-- 8. DISPUTES + EVIDENCE — trade parties only.
-- =====================================================================

create policy "disputes_select_parties"
  on public.disputes for select
  to authenticated
  using (buyer_id = public.current_user_id() or seller_id = public.current_user_id());

create policy "disputes_insert_parties"
  on public.disputes for insert
  to authenticated
  with check (buyer_id = public.current_user_id() or seller_id = public.current_user_id());

create policy "disputes_update_parties"
  on public.disputes for update
  to authenticated
  using (buyer_id = public.current_user_id() or seller_id = public.current_user_id())
  with check (buyer_id = public.current_user_id() or seller_id = public.current_user_id());

create policy "dispute_evidence_read_parties"
  on public.dispute_evidence for select
  to authenticated
  using (exists (
    select 1 from public.disputes d
    where d.id = dispute_id
      and (d.buyer_id = public.current_user_id() or d.seller_id = public.current_user_id())
  ));

create policy "dispute_evidence_insert_parties"
  on public.dispute_evidence for insert
  to authenticated
  with check (exists (
    select 1 from public.disputes d
    where d.id = dispute_id
      and (d.buyer_id = public.current_user_id() or d.seller_id = public.current_user_id())
  ));

create policy "dispute_evidence_update_parties"
  on public.dispute_evidence for update
  to authenticated
  using (exists (
    select 1 from public.disputes d
    where d.id = dispute_id
      and (d.buyer_id = public.current_user_id() or d.seller_id = public.current_user_id())
  ))
  with check (exists (
    select 1 from public.disputes d
    where d.id = dispute_id
      and (d.buyer_id = public.current_user_id() or d.seller_id = public.current_user_id())
  ));

-- =====================================================================
-- 9. RATINGS — public read (profile pages), self-scoped + party insert only.
-- =====================================================================

create policy "trade_ratings_select_public"
  on public.trade_ratings for select
  to anon, authenticated
  using (true);

create policy "trade_ratings_insert_owner"
  on public.trade_ratings for insert
  to authenticated
  with check (
    rater_id = public.current_user_id()
    and exists (
      select 1 from public.trades t
      where t.id = trade_id
        and (t.buyer_id = public.current_user_id() or t.seller_id = public.current_user_id())
    )
  );

-- =====================================================================
-- 10. REPUTATION — public read (profile + leaderboards), no client writes.
--     Writes happen owner-side only (RPC `increment_reputation_score` and
--     future triggers), which bypass RLS.
-- =====================================================================

create policy "reputation_scores_select_public"
  on public.reputation_scores for select
  to anon, authenticated
  using (true);

create policy "reputation_points_select_public"
  on public.reputation_points for select
  to anon, authenticated
  using (true);

create policy "reputation_badges_select_public"
  on public.reputation_badges for select
  to anon, authenticated
  using (true);

create policy "reputation_recent_stats_select_public"
  on public.reputation_recent_stats for select
  to anon, authenticated
  using (true);

-- Drop the permissive rls_*_any_* policies from the 2026-08-14 migration
-- (created dynamically; same loop here).
do $$
declare
  t text;
begin
  foreach t in array array['disputes','dispute_evidence','trade_ratings','reputation_scores','reputation_points','reputation_badges','reputation_recent_stats']
  loop
    execute format('drop policy if exists %I on public.%I', 'rls_read_any_'  || t, t);
    execute format('drop policy if exists %I on public.%I', 'rls_insert_any_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'rls_update_any_' || t, t);
  end loop;
end $$;

-- =====================================================================
-- 11. STORAGE — avatars stay world-readable; uploads/overwrites are bound to
--     the signer's wallet based on the object path (`{wallet}-{ts}.{ext}`).
-- =====================================================================

drop policy if exists "avatars_anon_write"  on storage.objects;
drop policy if exists "avatars_anon_update" on storage.objects;

create policy "avatars_self_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '-', 1) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
    and name <> ''
  );

create policy "avatars_self_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '-', 1) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
    and name <> ''
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '-', 1) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
    and name <> ''
  );

-- =====================================================================
-- 12. SECURITY DEFINER hygiene — pin search_path on the chat/notify
--     triggers (see docs/security-audit.md, Medium: search_path hygiene).
-- =====================================================================

create or replace function public.create_conversation_for_trade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
begin
  insert into public.conversations (trade_id, last_message_at)
  values (new.id, new.created_at)
  returning id into v_conv_id;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values
    (v_conv_id, new.buyer_id,  'buyer'),
    (v_conv_id, new.seller_id, 'seller');

  return new;
end;
$$;

create or replace function public.bump_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
     set last_message_at      = new.created_at,
         last_message_preview = case
           when length(new.body) > 200 then left(new.body, 200) || '…'
           else new.body
         end,
         updated_at           = now()
   where id = new.conversation_id;
  return new;
end;
$$;

create or replace function public.notify_conversation_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant record;
  v_trade_id    uuid;
  v_sender_name text;
begin
  select trade_id into v_trade_id
    from public.conversations
   where id = new.conversation_id;

  select coalesce(nickname, wallet_address) into v_sender_name
    from public.users
   where id = new.sender_id;

  for v_participant in
    select user_id
      from public.conversation_participants
     where conversation_id = new.conversation_id
       and user_id <> new.sender_id
  loop
    insert into public.notifications (
      user_id, kind, conversation_id, message_id, trade_id,
      title, body, payload
    ) values (
      v_participant.user_id,
      'message',
      new.conversation_id,
      new.id,
      v_trade_id,
      'New message',
      coalesce(v_sender_name, 'Someone') || ': '
        || case when length(new.body) > 100
                then left(new.body, 100) || '…'
                else new.body end,
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'message_id',      new.id,
        'sender_id',       new.sender_id
      )
    );
  end loop;

  return new;
end;
$$;