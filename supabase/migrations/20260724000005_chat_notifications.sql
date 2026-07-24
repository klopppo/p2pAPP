-- Notifications for chat + trade events.
-- The notifications table is the in-app feed (bell icon in the navbar).
-- The notification_preferences table is per-user, per-channel enable/disable.
--
-- A trigger on `messages` writes one row per recipient (everyone in the
-- conversation except the sender). Email delivery is handled separately by
-- the client-side dispatcher in `src/lib/notifications/` which reads
-- notification_preferences to decide which channels to fan out to.
--
-- RLS posture is permissive to match the rest of the app; tighten once SIWE
-- is wired (notifications: own rows only; prefs: own rows only).

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'notification_kind') then
    create type notification_kind as enum
      ('message', 'trade_update', 'dispute_update', 'system');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'notification_channel') then
    -- Only channels the app actually delivers. Add 'sms' / 'push' here as
    -- those channels come online so notification_preferences stays forward-
    -- compatible.
    create type notification_channel as enum ('inapp', 'email');
  end if;
end $$;

-- =====================================================================
-- 2. NOTIFICATIONS
-- =====================================================================

create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  kind            notification_kind not null,
  -- Optional links to the source row. Any of these can be NULL (system
  -- notifications, for instance). ON DELETE CASCADE keeps the feed clean
  -- when the underlying conversation/message/trade is removed.
  conversation_id uuid references conversations(id) on delete cascade,
  message_id      uuid references messages(id) on delete cascade,
  trade_id        uuid references trades(id) on delete cascade,
  title           text not null,
  body            text not null,
  payload         jsonb not null default '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on notifications(user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on notifications(user_id) where read_at is null;

-- =====================================================================
-- 3. NOTIFICATION PREFERENCES
-- =====================================================================

create table if not exists notification_preferences (
  user_id        uuid not null references users(id) on delete cascade,
  channel        notification_channel not null,
  enabled        boolean not null default true,
  -- Currently only used for the email channel. Kept on this table (rather
  -- than on the user profile) so we can grow the contact surface per-channel
  -- without restructuring the schema.
  email_address  text,
  updated_at     timestamptz not null default now(),
  primary key (user_id, channel)
);

-- =====================================================================
-- 4. TRIGGERS — auto-notify on new message
-- =====================================================================

create or replace function public.notify_conversation_message()
returns trigger
language plpgsql
security definer
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

drop trigger if exists trg_notify_message on public.messages;
create trigger trg_notify_message
  after insert on public.messages
  for each row execute function public.notify_conversation_message();

-- =====================================================================
-- 5. ROW LEVEL SECURITY + POLICIES
-- =====================================================================

alter table notifications            enable row level security;
alter table notification_preferences enable row level security;

drop policy if exists "notifications_all" on public.notifications;
create policy "notifications_all"
  on public.notifications for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "notif_prefs_all" on public.notification_preferences;
create policy "notif_prefs_all"
  on public.notification_preferences for all
  to anon, authenticated
  using (true) with check (true);
