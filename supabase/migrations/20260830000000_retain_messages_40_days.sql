-- Message retention: purge messages older than 40 days.
--
-- Runs nightly at 03:00 via pg_cron. FK-safe:
--   * `messages` is a parent of nothing (message_attachments is a loose/0-N
--     reference, no FK) so deletion only cascades down.
--   * `notifications.message_id REFERENCES messages(id) ON DELETE CASCADE`
--     (see 20260724000005) — notification rows for purged messages follow
--     automatically.
--   * `conversation_participants.last_read_message_id` has NO FK and is a
--     loose pointer — reset it first, otherwise a dangling cursor makes the
--     unread-count query fall back to 1970-01-01 and the badge spikes to
--     "everything is unread".
--
-- After purging we re-derive `conversations.last_message_at/preview` for
-- affected threads so the sidebar never shows the text of a deleted message.

-- Index so the nightly scan is cheap (existing idx is on
-- (conversation_id, created_at), useless for an age-based purge).
create index if not exists idx_messages_created_at
  on public.messages (created_at);

create extension if not exists pg_cron;

-- Idempotent reschedule: drop the previous job (if any), re-create it.
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'purge-old-messages';

select cron.schedule(
  'purge-old-messages',
  '0 3 * * *',
  $sql$
    -- 1. Reset read cursors that would otherwise dangle.
    update public.conversation_participants cp
       set last_read_message_id = null
      from public.messages m
     where cp.last_read_message_id = m.id
       and m.created_at < now() - interval '40 days';

    -- 2. Purge. Notifications referencing purged rows cascade.
    delete from public.messages
     where created_at < now() - interval '40 days';

    -- 3. Recompute the sidebar preview for threads whose newest message
    --    was just purged (newest remaining message wins; empty thread → null).
    update public.conversations c
       set last_message_at    = m.created_at,
           last_message_preview = case
             when length(m.body) > 200 then left(m.body, 200) || '…'
             else m.body
           end,
           updated_at         = now()
      from (
        select distinct on (mm.conversation_id)
               mm.conversation_id, mm.created_at, mm.body
          from public.messages mm
          join public.conversations cc on cc.id = mm.conversation_id
         where cc.last_message_at < now() - interval '40 days'
         order by mm.conversation_id, mm.created_at desc, mm.id desc
      ) m
     where c.id = m.conversation_id;

    update public.conversations
       set last_message_at = null,
           last_message_preview = null
     where last_message_at < now() - interval '40 days'
       and not exists (
         select 1 from public.messages
          where conversation_id = conversations.id
       );
  $sql$
);