-- Chat schema for P2P trades: conversations, participants, messages, attachments.
-- Conversations are created automatically when a trade row is inserted (see
-- `create_conversation_for_trade` trigger at the bottom of this file) so the
-- client never has to wire up the conversation separately.
--
-- RLS posture mirrors the rest of the app (see trades migration 20260626000003):
-- permissive for now, scoped to `anon, authenticated`. Tighten once wallet-based
-- auth (SIWE) is wired up — every policy below should become "user is a
-- participant in the conversation" using `auth.uid()`.
--
-- Target schema reference: docs/database-relational-schema.md.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'conversation_status') then
    create type conversation_status as enum ('open', 'archived', 'locked');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'conversation_participant_role') then
    create type conversation_participant_role as enum
      ('buyer', 'seller', 'mediator', 'observer');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'message_kind') then
    create type message_kind as enum ('text', 'system', 'payment_hint');
  end if;
end $$;

-- =====================================================================
-- 2. CONVERSATIONS
-- =====================================================================

create table if not exists conversations (
  id                  uuid primary key default gen_random_uuid(),
  -- One conversation per trade. NULL is reserved for direct (pre-trade)
  -- conversations, which are out of scope for v1.
  trade_id            uuid unique references trades(id) on delete cascade,
  status              conversation_status not null default 'open',
  last_message_at     timestamptz,
  last_message_preview text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_conversations_last_message_at
  on conversations(last_message_at desc nulls last);

-- =====================================================================
-- 3. CONVERSATION PARTICIPANTS
-- =====================================================================

create table if not exists conversation_participants (
  conversation_id     uuid not null references conversations(id) on delete cascade,
  user_id             uuid not null references users(id) on delete cascade,
  role                conversation_participant_role not null,
  -- Pointer to the last message this participant has read (for unread badges).
  last_read_message_id uuid,
  muted               boolean not null default false,
  joined_at           timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists idx_conv_participants_user
  on conversation_participants(user_id);

-- =====================================================================
-- 4. MESSAGES
-- =====================================================================

create table if not exists messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references conversations(id) on delete cascade,
  sender_id           uuid not null references users(id),
  body                text not null check (length(btrim(body)) > 0),
  kind                message_kind not null default 'text',
  created_at          timestamptz not null default now()
);

create index if not exists idx_messages_conv_created
  on messages(conversation_id, created_at);

-- =====================================================================
-- 5. MESSAGE ATTACHMENTS (optional, for future image/file sharing)
-- =====================================================================

create table if not exists message_attachments (
  id                  uuid primary key default gen_random_uuid(),
  storage_path        text not null,
  mime                text not null,
  size_bytes          integer not null check (size_bytes > 0),
  sha256              text,
  uploaded_by         uuid not null references users(id),
  created_at          timestamptz not null default now()
);

-- =====================================================================
-- 6. TRIGGERS
-- =====================================================================

-- Auto-create a conversation + participants when a trade is created.
-- Trade already has buyer_id/seller_id (see 20260626000003), so the trigger
-- just mirrors them into a chat thread. New columns in messages/conversations
-- can also be added to a message kind default of 'text'.
create or replace function public.create_conversation_for_trade()
returns trigger
language plpgsql
security definer
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

drop trigger if exists trg_create_conversation_for_trade on public.trades;
create trigger trg_create_conversation_for_trade
  after insert on public.trades
  for each row execute function public.create_conversation_for_trade();

-- Keep the conversation's last_message_* fields fresh on every new message.
create or replace function public.bump_conversation_last_message()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.conversations
     set last_message_at    = new.created_at,
         last_message_preview = case
           when length(new.body) > 200 then left(new.body, 200) || '…'
           else new.body
         end,
         updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_conversation_last_message on public.messages;
create trigger trg_bump_conversation_last_message
  after insert on public.messages
  for each row execute function public.bump_conversation_last_message();

-- =====================================================================
-- 7. ROW LEVEL SECURITY + POLICIES
-- =====================================================================

alter table conversations            enable row level security;
alter table conversation_participants enable row level security;
alter table messages                 enable row level security;
alter table message_attachments      enable row level security;

drop policy if exists "conversations_all" on public.conversations;
create policy "conversations_all"
  on public.conversations for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "conv_participants_all" on public.conversation_participants;
create policy "conv_participants_all"
  on public.conversation_participants for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "messages_all" on public.messages;
create policy "messages_all"
  on public.messages for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "message_attachments_all" on public.message_attachments;
create policy "message_attachments_all"
  on public.message_attachments for all
  to anon, authenticated
  using (true) with check (true);
