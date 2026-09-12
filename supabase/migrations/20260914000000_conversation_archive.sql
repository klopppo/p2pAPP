-- Archive trade conversations when the trade reaches a terminal state.
--
-- `conversations.status` already carries an 'archived' value (see
-- 20260724000004), but nothing ever set it, so completed-trade chats stayed
-- in the active inbox forever. This trigger moves a trade-linked conversation
-- into the archive as soon as the trade becomes terminal.
--
-- Direct conversations (`trade_id IS NULL`) — e.g. a chat started from a
-- profile page — are deliberately never touched, so they stay persistent.

create or replace function public.archive_conversation_on_trade_terminal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('completed', 'cancelled', 'refunded')
     and old.status is distinct from new.status then
    update public.conversations
       set status = 'archived',
           updated_at = now()
     where trade_id = new.id
       and status <> 'archived';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_archive_conversation_on_trade_terminal on public.trades;
create trigger trg_archive_conversation_on_trade_terminal
  after update on public.trades
  for each row execute function public.archive_conversation_on_trade_terminal();

-- Backfill: conversations whose trade is already terminal.
update public.conversations c
   set status = 'archived',
       updated_at = now()
  from public.trades t
 where c.trade_id = t.id
   and t.status in ('completed', 'cancelled', 'refunded')
   and c.status <> 'archived';
