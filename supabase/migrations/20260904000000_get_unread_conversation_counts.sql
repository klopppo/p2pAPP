-- Per-user unread conversation counts in ONE round-trip.
--
-- Replaces the N+1 pattern that `listConversations` used to issue (one
-- `count` query per conversation *per page load*). Each additional open
-- thread added a full round-trip to the chat sidebar, which is what made
-- the inbox feel slow to load after signing in.
--
-- Semantics preserved from the old client code:
--   * count messages in each of the user's conversations
--   * exclude messages the user themselves sent
--   * if `last_read_message_id` is set, count only messages STRICTLY newer
--     than that message — composite (created_at, id) cursor so same-millisecond
--     messages can't drift across the boundary
--   * if no message was ever read, every incoming message counts (old behavior)
--
-- Security: SECURITY DEFINER (bypasses RLS like the other helpers), but the
-- function is hard-gated to the signed-in wallet via `current_user_id()` —
-- p_user_id is only honored when it equals the session user, so a caller
-- can't enumerate another user's inbox. Requires the SIWE migration
-- (20260829000002) to already have created `current_user_id()`.
--
-- Idempotent: `create or replace`.

create or replace function public.get_unread_conversation_counts(p_user_id uuid)
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select cp.conversation_id
       , count(m.id)::bigint as unread_count
  from public.conversation_participants cp
  left join public.messages lr
    on lr.id = cp.last_read_message_id
  left join public.messages m
    on m.conversation_id = cp.conversation_id
   and m.sender_id <> cp.user_id
   and (
         cp.last_read_message_id is null
         or m.created_at > lr.created_at
         or (m.created_at = lr.created_at and m.id > lr.id)
       )
  where cp.user_id = public.current_user_id()
    and public.current_user_id() = p_user_id
  group by cp.conversation_id
$$;

grant execute on function public.get_unread_conversation_counts(uuid)
  to anon, authenticated;