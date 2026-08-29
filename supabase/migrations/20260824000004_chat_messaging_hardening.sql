-- Chat subsystem hardening pass — second wave.
-- Idempotent. See docstring in src/components/custom/chat for what this
-- migration enables. Companion migration to 20260724000004.
--
-- 1. bump_conversation_last_message trigger now fires on
--    INSERT OR UPDATE OR DELETE so a future message edit / delete UI
--    doesn't desync last_message_at / last_message_preview.
--
-- 2. conversation_participants.last_read_message_id gets a real FK to
--    messages(id) ON DELETE SET NULL so a deleted message automatically
--    clears the cursor instead of leaving an orphan UUID.
--
-- 3. message_attachments was defined but unused by anyone — no FK to
--    messages, no UI emits an upload, no PostgREST query reads it.
--    Dropping it removes a dead schema surface.
--
-- 4. message_kind enum's 'payment_hint' value was defined but no UI ever
--    emits it. Intentionally NOT dropped here: ALTER TYPE ... DROP VALUE
--    cannot run inside a transaction block, and supabase applies every
--    migration file inside a transaction (all-or-nothing, tracked in
--    supabase_migrations.schema_migrations). The value lingers as an
--    unused-but-valid label; drop it out-of-band with the manual command
--    noted in section 4.

-- ---------------------------------------------------------------------------
-- 1. Wider trigger scope.
-- ---------------------------------------------------------------------------

drop trigger if exists trg_bump_conversation_last_message on public.messages;

create or replace function public.bump_conversation_last_message()
returns trigger
language plpgsql
security definer
as $$
declare
  v_other_body text;
  v_other_at   timestamptz;
begin
  if (tg_op = 'INSERT') then
    -- New message: the row IS the new latest.
    update public.conversations
       set last_message_at    = new.created_at,
           last_message_preview = case
             when length(new.body) > 200 then left(new.body, 200) || '…'
             else new.body
           end,
           updated_at = now()
     where id = new.conversation_id;
    return new;
  elsif (tg_op = 'UPDATE') then
    -- Edited message: re-derive from the (possibly-edited) row.
    update public.conversations
       set last_message_at    = new.created_at,
           last_message_preview = case
             when length(new.body) > 200 then left(new.body, 200) || '…'
             else new.body
           end,
           updated_at = now()
     where id = new.conversation_id;
    return new;
  else
    -- DELETE: the row is gone. Look for the next-newest surviving row.
    -- `where id <> old.id` is a no-op safety guard; the cursor row is
    -- already absent after the DELETE.
    select created_at, body
      into v_other_at, v_other_body
      from public.messages
     where conversation_id = old.conversation_id
     order by created_at desc
     limit 1;

    if v_other_at is null then
      -- Last message in the conversation was deleted — clear the denormalised fields.
      update public.conversations
         set last_message_at    = null,
             last_message_preview = null,
             updated_at = now()
       where id = old.conversation_id;
    else
      update public.conversations
         set last_message_at    = v_other_at,
             last_message_preview = case
               when length(v_other_body) > 200 then left(v_other_body, 200) || '…'
               else v_other_body
             end,
             updated_at = now()
       where id = old.conversation_id;
    end if;
    return old;
  end if;
end;
$$;

create trigger trg_bump_conversation_last_message
  after insert or update or delete on public.messages
  for each row execute function public.bump_conversation_last_message();

-- ---------------------------------------------------------------------------
-- 2. FK on last_read_message_id so deleted messages auto-clear the cursor.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'conversation_participants'
      and column_name = 'last_read_message_id'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'conversation_participants_last_read_message_id_fkey'
      and conrelid = 'public.conversation_participants'::regclass
  ) then
    -- Drop any orphan pointing at a deleted message before adding the
    -- FK so the constraint doesn't fail to create.
    update public.conversation_participants
       set last_read_message_id = null
     where last_read_message_id is not null
       and not exists (
         select 1 from public.messages m
         where m.id = conversation_participants.last_read_message_id
       );
    alter table public.conversation_participants
      add constraint conversation_participants_last_read_message_id_fkey
      foreign key (last_read_message_id)
      references public.messages(id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Drop message_attachments (dead schema — no FK, no consumer).
-- ---------------------------------------------------------------------------

drop table if exists public.message_attachments;

-- ---------------------------------------------------------------------------
-- 4. message_kind 'payment_hint' — deliberately kept.
--    ALTER TYPE ... DROP VALUE cannot execute inside a transaction block, and
--    supabase runs each migration file in a transaction, so dropping the enum
--    value from a migration is not reliably possible. The value was never
--    emitted by the UI, so it remains harmlessly as an unused label (kept in
--    sync with MessageKind.PAYMENT_HINT in src/types/database.ts).
--
--    To drop it out-of-band (NOT via `supabase db push` / a migration), run on
--    a maintenance connection after confirming no row uses it:
--
--      select count(*) from public.messages where kind = 'payment_hint';
--      --                     ^ 0 required, otherwise the value is still in use
--      alter type message_kind drop value 'payment_hint';
-- ---------------------------------------------------------------------------
