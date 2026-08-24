-- Bootstrap migration: create the `users` and `offers` tables from scratch.
--
-- Required because no other migration creates them, but every FK references them
-- (e.g. `trades.buyer_id references users(id)`, `offers.seller_id references
-- users(id)`). A fresh `supabase db push` from a clean checkout otherwise fails
-- with:
--     ERROR: relation "users" does not exist
-- on every FK constraint.
--
-- Dated `20260101000000_*` so it sorts before every other migration (whether
-- the file MTime ordering or the lexicographic timestamp sorting the supabase
-- CLI uses).
--
-- ⚠️ Two design notes:
--   1. `citext` is the recommended column type for `wallet_address` (case-
--      insensitive) per docs/database-relational-schema.md §1. It requires
--      the `citext` extension, which Supabase enables by default.
--      Statements are guarded with `exception` so the migration is also safe
--      on DBs where the extension is missing or the column already exists.
--   2. RLS is permissive here to match the existing posture (see
--      20260626000000_allow_users_writes.sql). Lock down once SIWE lands.

-- =====================================================================
-- Extensions
-- =====================================================================

do $$
begin
  begin
    create extension if not exists citext;
  exception when others then
    raise notice 'citext extension not available — falling back to text';
  end;
end $$;

-- =====================================================================
-- Enums
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('user', 'admin', 'mediator', 'support');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'verification_level') then
    create type verification_level as enum
      ('unverified', 'verified', 'trusted', 'suspicious');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'offer_status') then
    create type offer_status as enum
      ('active', 'paused', 'completed', 'cancelled', 'expired');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'offer_type') then
    create type offer_type as enum ('buy', 'sell');
  end if;
end $$;

-- =====================================================================
-- USERS
-- =====================================================================

create table if not exists users (
  id                  uuid primary key default gen_random_uuid(),
  wallet_address      text not null unique,
  role                user_role not null default 'user',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  nickname            varchar(50) unique,
  avatar_url          text,
  bio                 varchar(500),
  location            varchar(100),

  -- social handles (added 2026-07-25; safe re-add)
  website             text,
  twitter_handle      text,
  telegram_handle     text,
  github_handle       text,

  -- Denormalized metrics (mirrors are kept fresh by the RPC
  -- `increment_reputation_score` and other server-side triggers).
  verification_level  verification_level not null default 'unverified',
  reputation_score    smallint not null default 50
                      check (reputation_score between 0 and 100),
  total_trades        int not null default 0,
  completed_trades    int not null default 0,
  cancelled_trades    int not null default 0,
  dispute_count       int not null default 0,
  avg_rating          numeric(3,2) default 0
                      check (avg_rating between 0 and 5),
  last_active_at      timestamptz,

  -- Optional: 30d/unique counters (mirrored from aggregate jobs).
  unique_traders      int,
  total_volume        numeric(30,18),
  last_30d_trades     int,
  last_30d_volume     numeric(30,18)
);

create index if not exists idx_users_wallet on users(wallet_address);
create index if not exists idx_users_last_active on users(last_active_at);

alter table users enable row level security;

do $$
declare
  p text;
begin
  -- SELECT (anon + authenticated can read profiles — needed for the join
  -- shapes the supabase client uses everywhere).
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='users' and policyname='users_select_any') then
    create policy users_select_any on public.users
      for select to anon, authenticated using (true);
  end if;

  -- INSERT — see 20260626000000_allow_users_writes.sql (idempotent).
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='users' and policyname='users_insert_any') then
    create policy users_insert_any on public.users
      for insert to anon, authenticated with check (true);
  end if;
  -- UPDATE — same.
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='users' and policyname='users_update_any') then
    create policy users_update_any on public.users
      for update to anon, authenticated using (true) with check (true);
  end if;
end $$;

-- =====================================================================
-- OFFERS
-- =====================================================================

create table if not exists offers (
  id                  uuid primary key default gen_random_uuid(),
  offer_id            varchar(40) not null unique,
  seller_id           uuid not null references users(id) on delete cascade,
  status              offer_status not null default 'active',
  type                offer_type not null,

  crypto_token        varchar(10) not null,
  crypto_amount       numeric(30,18) not null check (crypto_amount > 0),
  fiat_currency       char(3) not null,
  fiat_amount         numeric(20,2) not null check (fiat_amount > 0),
  price_per_unit      numeric(30,18) not null check (price_per_unit > 0),

  min_amount          numeric(20,2) not null,
  max_amount          numeric(20,2) not null,
  payment_methods     text[] not null default '{}',
  available_regions   text[] not null default '{}',

  platform_fee_bps    int not null default 50
                      check (platform_fee_bps between 0 and 5000),
  network_fee         numeric(20,8) not null default 0,

  premium_multiplier  numeric(4,2) check (premium_multiplier is null or premium_multiplier >= 1),
  tags                text[] not null default '{}',
  featured            boolean not null default false,

  description         text,

  published_at        timestamptz not null default now(),
  expires_at          timestamptz,
  views               int not null default 0,
  clicks              int not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_offers_seller    on offers(seller_id);
create index if not exists idx_offers_status     on offers(status);
create index if not exists idx_offers_expires    on offers(expires_at);
create index if not exists idx_offers_published  on offers(published_at desc);

alter table offers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='offers' and policyname='offers_select_any') then
    create policy offers_select_any on public.offers
      for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='offers' and policyname='offers_insert_any') then
    create policy offers_insert_any on public.offers
      for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='offers' and policyname='offers_update_any') then
    create policy offers_update_any on public.offers
      for update to anon, authenticated using (true) with check (true);
  end if;
end $$;
