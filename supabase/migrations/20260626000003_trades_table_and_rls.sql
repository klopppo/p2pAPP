-- Create the trades + trade_events tables (with buyer_id / seller_id / status)
-- and enable permissive RLS so the client can read/write them.
--
-- This is intentionally IDEMPOTENT and NON-DESTRUCTIVE: the live DB state is
-- uncertain (the only trade definitions live in docs/, and
-- docs/migrations/001-escrow-lifecycle-update.sql is broken — it drops the
-- table WITHOUT buyer_id/seller_id/status then indexes them). Everything below
-- is guarded so it is safe whether trades exists yet or not.
--
-- Target schema: docs/database-relational-schema.md §12 TRADES / §14 TRADE EVENTS.
--
-- ⚠️ SECURITY: RLS policies here are permissive (any anon/authenticated client
-- can read/insert/update any trade) — same posture as the current users/offers
-- policies. Lock down once wallet-based auth (SIWE) is wired up.

-- =====================================================================
-- 1. ENUMS (create only if missing)
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'trade_status') then
    create type trade_status as enum (
      'pending', 'active', 'completed', 'cancelled', 'disputed', 'refunded'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'escrow_status') then
    create type escrow_status as enum (
      'awaiting_deposit', 'deposited', 'pending_release',
      'disputed', 'released', 'refunded'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'event_type') then
    create type event_type as enum (
      'offer_created', 'offer_accepted', 'offer_completed',
      'offer_cancelled', 'offer_expired',
      'payment_sent', 'crypto_sent',
      'escrow_deposited', 'escrow_confirmed', 'escrow_released',
      'escrow_refunded', 'escrow_disputed', 'escrow_resolved',
      'rating_submitted', 'dispute_opened', 'dispute_resolved',
      'cancellation', 'refund_issued'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'event_actor') then
    create type event_actor as enum ('buyer', 'seller', 'system');
  end if;
end $$;

-- =====================================================================
-- 2. TRADES TABLE
-- =====================================================================

create table if not exists trades (
    id                      uuid primary key default gen_random_uuid(),
    trade_id                varchar(40) not null unique,
    offer_id                uuid references offers(id),
    status                  trade_status not null default 'pending',

    buyer_id                uuid not null references users(id),
    seller_id               uuid not null references users(id),
    check (buyer_id <> seller_id),

    crypto_token            varchar(10) not null,
    crypto_amount           numeric(30,18) not null check (crypto_amount > 0),
    crypto_price_per_unit   numeric(30,18) not null check (crypto_price_per_unit > 0),
    crypto_total            numeric(30,18) generated always as
                            (crypto_amount * crypto_price_per_unit) stored,

    fiat_currency           char(3) not null,
    fiat_amount             numeric(20,2) not null check (fiat_amount > 0),
    fiat_received           numeric(20,2) not null default 0,

    payment_method          varchar(50) not null,
    payment_details         jsonb not null default '{}',

    -- DB-managed escrow (no smart contract yet): escrow_contract_addr stays NULL.
    escrow_contract_addr    varchar(42),
    escrow_status           escrow_status not null default 'awaiting_deposit',
    escrow_tx_hash          varchar(66),

    platform_fee_bps        int not null default 50 check (platform_fee_bps between 0 and 10000),
    treasury_address        varchar(42),

    has_dispute             boolean not null default false,

    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    completed_at            timestamptz,
    cancelled_at            timestamptz,
    disputed_at             timestamptz
);

-- If a (broken) trades table already existed without these columns, add them.
alter table trades add column if not exists buyer_id uuid;
alter table trades add column if not exists seller_id uuid;
alter table trades add column if not exists status trade_status not null default 'pending';

-- DB-managed escrow never has a contract address — make sure the column is nullable.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'trades' and column_name = 'escrow_contract_addr') then
    alter table trades alter column escrow_contract_addr drop not null;
  end if;
end $$;

create index if not exists idx_trades_buyer_created   on trades(buyer_id, created_at desc);
create index if not exists idx_trades_seller_created   on trades(seller_id, created_at desc);
create index if not exists idx_trades_status           on trades(status);
create index if not exists idx_trades_escrow_status    on trades(escrow_status);

-- =====================================================================
-- 3. TRADE EVENTS TABLE
-- =====================================================================

create table if not exists trade_events (
    id              uuid primary key default gen_random_uuid(),
    trade_id        uuid not null references trades(id) on delete cascade,
    type            event_type not null,
    actor           event_actor not null,
    description     text,
    metadata        jsonb not null default '{}',
    created_at      timestamptz not null default now()
);

create index if not exists idx_events_trade on trade_events(trade_id, created_at);

-- =====================================================================
-- 4. ROW LEVEL SECURITY + POLICIES
-- =====================================================================

alter table trades enable row level security;
alter table trade_events enable row level security;

drop policy if exists "trades_select_any" on public.trades;
create policy "trades_select_any"
  on public.trades for select
  to anon, authenticated
  using (true);

drop policy if exists "trades_insert_any" on public.trades;
create policy "trades_insert_any"
  on public.trades for insert
  to anon, authenticated
  with check (true);

drop policy if exists "trades_update_any" on public.trades;
create policy "trades_update_any"
  on public.trades for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "trade_events_insert_any" on public.trade_events;
create policy "trade_events_insert_any"
  on public.trade_events for insert
  to anon, authenticated
  with check (true);
