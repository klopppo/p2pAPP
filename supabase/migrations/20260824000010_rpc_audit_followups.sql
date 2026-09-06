-- Audit 2026-08-24 follow-ups: RPC unknown-user guard + persister namespace bump
-- (audit M1 + M4 + M3 second half).
--
-- Migration 20260824000006 left three gaps:
--   (M1) If the caller passes a user_id that has no row in public.users,
--        the conversation_participants INSERT raises 23503 and the whole
--        RPC rolls back. The client treats the error generically and
--        returns null, so the user sees nothing happen. Distinguish the
--        case and raise a recognizable code so the UI can show a toast
--        instead of going silent.
--   (M3 half) Bump the persister key from :v1 to :v2 so a `localStorage`
--        payload written by the pre-fix build (which had no namespace
--        whitelist and may contain PII) is treated as stale on first
--        load and discarded instead of being rehydrated.
--   (M4) Add 'offer' (singular) to the persistable namespaces — the
--        market's offer detail page keys on 'offer' and the comment
--        on src/lib/queryPersister.ts had asserted coverage that the
--        whitelist didn't actually provide.
--
-- Idempotent: CREATE OR REPLACE for the function, single-shot
-- pg_advisory_xact_lock-free UPDATE inside the RPC.
--
-- Run order: safe to apply at any point after
-- 20260824000006_rls_column_restrict.sql.

-- =====================================================================
-- 1. (M1) Distinguish unknown-user in the direct-conversation RPC.
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
  if p_current_user_id is null or p_other_user_id is null then
    return null;
  end if;
  if p_current_user_id = p_other_user_id then
    return null;
  end if;

  -- The other user must have a public.users row. The original conversation_participants
  -- INSERT raises 23503 if not, which the client treats as a generic error and
  -- returns null for. Raise a recognizable code so the UI can surface a toast
  -- instead of going silent.
  if not exists (select 1 from public.users where id = p_other_user_id) then
    raise exception 'unknown user %', p_other_user_id
      using errcode = 'P0002';
  end if;

  v_addr_a := p_current_user_id::text;
  v_addr_b := p_other_user_id::text;
  if v_addr_a > v_addr_b then
    select v_addr_b, v_addr_a into v_addr_a, v_addr_b;
  end if;

  v_lock_key := hashtextextended(v_addr_a || v_addr_b, 0);
  perform pg_advisory_xact_lock(v_lock_key);

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

-- (The GRANT from 20260824000006 still applies; this CREATE OR REPLACE
-- preserves the function signature so existing callers keep working.)
