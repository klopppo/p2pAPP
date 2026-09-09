-- RLS column-restriction hardening (Audit 2026-08-24, Critical #2 + Critical #3).
--
-- Closes two complementary gaps left by the wallet-scoped RLS rewrite in
-- 20260829000002_siwe_auth_rls.sql:
--
-- 1. CRITICAL #3 — Column-allow-all.
--    `trades_update_parties`, `disputes_update_parties`, and
--    `users_update_self` accept any UPDATE column. A trade party can flip
--    `trades.status` to 'completed' without ever settling the escrow, write
--    a `disputes.winner` on themselves, or self-promote `users.role` to
--    'admin'. None of these columns have a legitimate client write path —
--    they are server-side mirrors populated by an indexer / RPC.
--
--    Fix: belt-and-suspenders.
--      a) Column-level GRANT revoke. The authenticated / anon roles lose
--         UPDATE on the sensitive columns outright, regardless of the
--         row-level RLS policy. This is the load-bearing fix.
--      b) Column-scoped WITH CHECK on the named policies, comparing NEW
--         against a subquery of the current row. Defense in depth: stays
--         effective even if a later SIWE re-apply drops and re-creates the
--         policy without our column check — the GRANT revoke above
--         persists (independent of RLS state).
--
-- 2. CRITICAL #2 — `getOrCreateDirectConversation` race.
--    The client implementation in src/lib/supabase/index.ts read-then-wrote
--    without any concurrency guard, so two tabs racing to open the same
--    direct chat could each insert a fresh `conversations` row.
--
--    Fix: move the whole sequence into a SECURITY DEFINER RPC
--    `get_or_create_direct_conversation` that takes a transaction-scoped
--    advisory lock keyed on the sorted participant pair before reading.
--    Concurrent callers serialize on it; the second one re-checks and
--    returns the first one's row.
--
-- Idempotent: `create or replace` for the function; `drop policy if exists`
-- + recreate for the policies; REVOKE is itself idempotent.
--
-- Run order: this migration is safe to apply BEFORE or AFTER the SIWE RLS
-- rewrite. The column-level GRANT revoke is grant-level (independent of
-- RLS state), so it remains effective even if a later SIWE re-apply drops
-- our named policies.

-- ---------------------------------------------------------------------------
-- 0. Prerequisites (kept here so this file also applies on fresh DBs where
--    the SIWE rewrite has not run yet, and on drifted remotes that predate
--    both). Idempotent.
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

-- The on-chain mirror columns (and the legacy proof columns) may be absent on
-- remotes that were created from an older revision of 20260814000001.
alter table public.disputes
  add column if not exists escrow_address        varchar(42);
alter table public.disputes
  add column if not exists kleros_dispute_id     text;
alter table public.disputes
  add column if not exists tx_hash               text;
alter table public.disputes
  add column if not exists tx_hash_evidence      text;
alter table public.disputes
  add column if not exists kleros_dispute_status smallint;
alter table public.disputes
  add column if not exists escrow_state          smallint;
alter table public.disputes
  add column if not exists evidence_cid          text;

-- =====================================================================
-- 1. RPC: race-safe direct conversation creation (Critical #2)
-- =====================================================================

create or replace function public.get_or_create_direct_conversation(
  p_current_user_id uuid,
  p_other_user_id    uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id   uuid;
  v_addr_a    text;
  v_addr_b    text;
  v_lock_key  bigint;
begin
  -- Defensive: refuse obviously bad inputs. The client already short-
  -- circuits on equal ids, but the RPC is callable directly too.
  if p_current_user_id is null or p_other_user_id is null then
    return null;
  end if;
  if p_current_user_id = p_other_user_id then
    return null;
  end if;

  -- Sort the two ids so both halves of the pair hash to the same lock key.
  -- Without this, A→B and B→A would take different locks and still race.
  v_addr_a := p_current_user_id::text;
  v_addr_b := p_other_user_id::text;
  if v_addr_a > v_addr_b then
    select v_addr_b, v_addr_a into v_addr_a, v_addr_b;
  end if;

  -- hashtextextended returns a bigint; pg_advisory_xact_lock(bigint) takes
  -- a transaction-scoped lock that's released automatically at COMMIT /
  -- ROLLBACK.
  v_lock_key := hashtextextended(v_addr_a || v_addr_b, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  -- Look for an existing conversation between these two participants.
  -- Matches any conversation (trade-anchored or not), so the returned id
  -- is unique-per-pair regardless of which chat thread the parties first
  -- met in.
  select c.id into v_conv_id
    from public.conversations c
    join public.conversation_participants p1
      on p1.conversation_id = c.id and p1.user_id = p_current_user_id
    join public.conversation_participants p2
      on p2.conversation_id = c.id and p2.user_id = p_other_user_id
   limit 1;

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  -- No existing conversation — create one. trade_id stays NULL (this is
  -- a direct, non-trade chat). Status defaults to 'open'.
  insert into public.conversations (trade_id, status)
    values (null, 'open')
    returning id into v_conv_id;

  insert into public.conversation_participants (conversation_id, user_id, role)
    values
      (v_conv_id, p_current_user_id, 'buyer'),
      (v_conv_id, p_other_user_id,   'seller');

  return v_conv_id;
end;
$$;

-- Grant execute to the client-facing roles. SECURITY DEFINER runs as the
-- function owner (table owner in Supabase), bypassing RLS — which is
-- correct here because the RPC validates its own preconditions.
revoke all on function public.get_or_create_direct_conversation(uuid, uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid, uuid) to anon, authenticated;

-- =====================================================================
-- 2. Column-level GRANT revoke (Critical #3)
-- =====================================================================
--
-- PostgreSQL column-level grants: revoke UPDATE on the sensitive columns
-- from the two client-facing roles. The row-level RLS policies
-- (`trades_update_parties`, etc.) decide WHICH ROWS a user can update;
-- these revokes decide WHICH COLUMNS a user can update. Combined, a trade
-- party can update, e.g., `fiat_received` on their own trade but cannot
-- touch `status`, `has_dispute`, `escrow_status`, or `completed_at` —
-- those columns are server-side mirrors populated by the indexer / RPCs.
--
-- The table owner (and SECURITY DEFINER functions it owns) keeps full
-- privileges, so the indexer and any future RPC can still write these.

revoke update (status, has_dispute, escrow_status, completed_at)
  on public.trades
  from authenticated, anon;

revoke update (status, winner, on_chain_ruling, kleros_dispute_status, resolved_at)
  on public.disputes
  from authenticated, anon;

revoke update (role)
  on public.users
  from authenticated, anon;

-- =====================================================================
-- 3. Column-scoped WITH CHECK on the named policies (Critical #3)
-- =====================================================================
--
-- Defense in depth: even if a future SIWE re-apply wipes these policies
-- and recreates them without the column check, the GRANT revoke above
-- stays effective (it's at the privilege level, not the policy level).
-- The WITH CHECK below is here to make the invariant readable and to
-- block any role that somehow retained the column grant.

drop policy if exists "trades_update_parties"      on public.trades;
drop policy if exists "disputes_update_parties"   on public.disputes;
drop policy if exists "users_update_self"         on public.users;
drop policy if exists "trades_update_any"         on public.trades;
drop policy if exists "disputes_update_any"       on public.disputes;
drop policy if exists "users_update_any"          on public.users;

create policy "trades_update_parties"
  on public.trades for update
  to authenticated
  using (
    buyer_id  = public.current_user_id()
    or seller_id = public.current_user_id()
  )
  with check (
    (buyer_id = public.current_user_id() or seller_id = public.current_user_id())
    and status        = (select t.status        from public.trades t where t.id = trades.id)
    and has_dispute   = (select t.has_dispute   from public.trades t where t.id = trades.id)
    and escrow_status = (select t.escrow_status from public.trades t where t.id = trades.id)
    and completed_at is not distinct from (select t.completed_at from public.trades t where t.id = trades.id)
  );

create policy "disputes_update_parties"
  on public.disputes for update
  to authenticated
  using (
    buyer_id  = public.current_user_id()
    or seller_id = public.current_user_id()
  )
  with check (
    (buyer_id = public.current_user_id() or seller_id = public.current_user_id())
    and status                = (select d.status                from public.disputes d where d.id = disputes.id)
    and winner                is not distinct from (select d.winner                from public.disputes d where d.id = disputes.id)
    and on_chain_ruling       is not distinct from (select d.on_chain_ruling       from public.disputes d where d.id = disputes.id)
    and kleros_dispute_status is not distinct from (select d.kleros_dispute_status from public.disputes d where d.id = disputes.id)
    and resolved_at           is not distinct from (select d.resolved_at           from public.disputes d where d.id = disputes.id)
  );

create policy "users_update_self"
  on public.users for update
  to authenticated
  using (wallet_address = lower(auth.jwt() ->> 'wallet_address'))
  with check (
    wallet_address = lower(auth.jwt() ->> 'wallet_address')
    and role = (select u.role from public.users u where u.id = users.id)
  );
