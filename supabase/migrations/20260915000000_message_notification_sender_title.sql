-- Message notifications: use the sender's name as the TITLE (instead of the
-- generic "New message") so the bell shows who wrote. The body is just the
-- message preview (the name is no longer duplicated there).
--
-- Also backfills existing message notifications that still carry the old
-- "New message" title, resolving the sender via `payload.sender_id`.

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
    select user_id, viewing_at
      from public.conversation_participants
     where conversation_id = new.conversation_id
       and user_id <> new.sender_id
       and muted = false
  loop
    -- Recipient has the chat open right now — generating a notification would
    -- be noise. Skip; the message still appears via Realtime in the open pane.
    if v_participant.viewing_at is not null
       and v_participant.viewing_at > now() - interval '2 minutes' then
      continue;
    end if;

    -- Collapse: keep only the latest UNREAD message notification per
    -- conversation so a burst of unseen messages shows as one row.
    delete from public.notifications
     where user_id = v_participant.user_id
       and conversation_id = new.conversation_id
       and kind = 'message'
       and read_at is null;

    insert into public.notifications (
      user_id, kind, conversation_id, message_id, trade_id,
      title, body, payload
    ) values (
      v_participant.user_id,
      'message',
      new.conversation_id,
      new.id,
      v_trade_id,
      coalesce(v_sender_name, 'Someone'),
      case when length(new.body) > 100
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

drop trigger if exists trg_notify_message on public.messages;
create trigger trg_notify_message
  after insert on public.messages
  for each row execute function public.notify_conversation_message();

-- Backfill: replace the old generic title with the sender's name.
update public.notifications n
   set title = coalesce(u.nickname, u.wallet_address, 'Someone')
  from public.users u
 where n.kind = 'message'
   and n.title = 'New message'
   and n.payload->>'sender_id' = u.id::text;
