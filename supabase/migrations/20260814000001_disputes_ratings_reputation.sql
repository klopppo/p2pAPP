-- Reproducible schema for the dispute / rating / reputation subsystem.
-- Mirrors docs/database-relational-schema.md §13 (trade_ratings), §15 (disputes),
-- §16 (dispute_evidence), §7-10 (reputation_*) plus the app's actual columns.
-- Idempotent — safe to re-run on a partially-migrated DB.
--
-- The app writes/reads these tables from the client (src/lib/supabase):
--   createDispute / getDisputesByTrade / getDisputesByUser / getDisputeById
--   submitTradeRating / getRatingsForTrade / getRatingsByUser / hasUserRatedTrade
--   updateUserReputation -> supabase.rpc('increment_reputation_score', {...})
-- Keep column names + FK constraint names in sync with the PostgREST
-- embed hints used above (e.g. `users!disputes_buyer_id_fkey`). Postgres
-- auto-names FKs `<table>_<column>_fkey`, which matches the hints.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'dispute_status') then
    create type dispute_status as enum (
      'open', 'in_review', 'escalated', 'resolved', 'closed'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- DISPUTES
-- ---------------------------------------------------------------------------

create table if not exists disputes (
  id                  uuid primary key default gen_random_uuid(),
  dispute_id          varchar(40) not null unique,
  trade_id            uuid not null unique references trades(id) on delete restrict,
  buyer_id            uuid not null references users(id),
  seller_id           uuid not null references users(id),
  status              dispute_status not null default 'open',
  reason              varchar(200) not null,
  reason_category     text not null,
  description         text,
  can_appeal          boolean not null default true,
  appeal_deadline     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  resolved_at         timestamptz,

  -- Kleros / on-chain mirrors (cache of the KlerosEsc + Kleros Court state).
  -- Columns are nullable because pre-mirror rows / partial deployments exist.
  escrow_address          varchar(42),
  kleros_dispute_id       text,
  tx_hash                 text,
  tx_hash_evidence        text,
  kleros_dispute_status   smallint,
  escrow_state            smallint,
  evidence_cid            text
);

create index if not exists idx_disputes_trade_id on disputes(trade_id);
create index if not exists idx_disputes_buyer_id on disputes(buyer_id);
create index if not exists idx_disputes_seller_id on disputes(seller_id);
create index if not exists idx_disputes_status on disputes(status);

-- ---------------------------------------------------------------------------
-- DISPUTE EVIDENCE (docs §16)
-- ---------------------------------------------------------------------------

create table if not exists dispute_evidence (
  id              uuid primary key default gen_random_uuid(),
  dispute_id      uuid not null references disputes(id) on delete cascade,
  submitted_by    varchar(6) not null check (submitted_by in ('buyer','seller','neutral')),
  evidence_kind   varchar(30) not null,
  file_hash       text not null,
  file_encrypted  text not null,
  submitted_at    timestamptz not null default now()
);

create index if not exists idx_dispute_evidence_dispute on dispute_evidence(dispute_id);

-- ---------------------------------------------------------------------------
-- TRADE RATINGS (docs §13)
-- ---------------------------------------------------------------------------

create table if not exists trade_ratings (
  id              uuid primary key default gen_random_uuid(),
  trade_id        uuid not null references trades(id) on delete cascade,
  rater_id        uuid not null references users(id),
  rated_id        uuid not null references users(id),
  direction       varchar(6) not null check (direction in ('buyer','seller')),
  score           smallint not null check (score between 1 and 5),
  comment         varchar(1000),
  anonymous       boolean not null default false,
  submitted_at    timestamptz not null default now(),
  unique (trade_id, direction)
);

create index if not exists idx_trade_ratings_rated on trade_ratings(rated_id);
create index if not exists idx_trade_ratings_rater on trade_ratings(rater_id);

-- ---------------------------------------------------------------------------
-- REPUTATION (docs §7-10)
-- ---------------------------------------------------------------------------

create table if not exists reputation_scores (
  user_id             uuid primary key references users(id) on delete cascade,
  overall             smallint not null default 50 check (overall between 0 and 100),
  trustworthiness     smallint not null default 50 check (trustworthiness between 0 and 100),
  reliability         smallint not null default 50 check (reliability between 0 and 100),
  communication       smallint not null default 50 check (communication between 0 and 100),
  speed               smallint not null default 50 check (speed between 0 and 100),
  professionalism     smallint not null default 50 check (professionalism between 0 and 100),
  points_total        integer not null default 0,
  points_earned       integer not null default 0,
  points_lost         integer not null default 0,
  updated_at          timestamptz not null default now()
);

create table if not exists reputation_points (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  category        varchar(50) not null,
  delta           integer not null,
  reason          varchar(200) not null,
  source          varchar(20) not null check (source in ('trade','rating','dispute','flag','system')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_reputation_points_user on reputation_points(user_id, created_at);

create table if not exists reputation_badges (
  user_id         uuid not null references users(id) on delete cascade,
  badge           varchar(50) not null,
  awarded_at      timestamptz not null default now(),
  primary key (user_id, badge)
);

create table if not exists reputation_recent_stats (
  user_id         uuid not null references users(id) on delete cascade,
  window          varchar(10) not null check (window in ('7d','30d')),
  trades          integer not null default 0,
  rating          numeric(3,2) default 0,
  disputes        integer not null default 0,
  response_hours  numeric(6,2),
  computed_at     timestamptz not null default now(),
  primary key (user_id, window)
);

-- ---------------------------------------------------------------------------
-- increment_reputation_score RPC
-- Called by src/lib/supabase `updateUserReputation(userId, delta)`.
-- Clamps the overall score to [0,100], keeps the points ledger, and (when the
-- denormalized column exists) mirrors the total onto users.reputation_score.
-- ---------------------------------------------------------------------------

create or replace function public.increment_reputation_score(user_id uuid, delta integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
begin
  -- First touch: seed a row so the trigger-less upsert below has a target.
  insert into public.reputation_scores (user_id)
  values (user_id)
  on conflict (user_id) do nothing;

  update public.reputation_scores
  set overall           = greatest(0, least(100, public.reputation_scores.overall + delta)),
      points_total      = public.reputation_scores.points_total + delta,
      points_earned     = public.reputation_scores.points_earned + greatest(0, delta),
      points_lost       = public.reputation_scores.points_lost + greatest(0, -delta),
      updated_at        = now()
  where public.reputation_scores.user_id = user_id;

  insert into public.reputation_points (user_id, category, delta, reason, source)
  values (user_id, 'overall', delta, 'Manual reputation adjustment', 'system');

  -- Mirror onto users.reputation_score (if the column exists). Guarded so the
  -- function also deploys on DBs where the users table is absent/incomplete.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users'
      and column_name = 'reputation_score'
  ) then
    execute '
      update public.users
      set reputation_score = greatest(0, least(100, reputation_score + $1))
      where id = $2
    ' using delta, user_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS — permissive for now, matching the existing tables (users/offers/trades).
-- Task: tighten these once wallet-auth (SIWE) lands; see the note in
-- 20260626000000_allow_users_writes.sql.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['disputes','dispute_evidence','trade_ratings','reputation_scores','reputation_points','reputation_badges','reputation_recent_stats']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'rls_read_any_' || t, t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      'rls_read_any_' || t, t
    );
    execute format('drop policy if exists %I on public.%I', 'rls_insert_any_' || t, t);
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated with check (true)',
      'rls_insert_any_' || t, t
    );
    execute format('drop policy if exists %I on public.%I', 'rls_update_any_' || t, t);
    execute format(
      'create policy %I on public.%I for update to anon, authenticated using (true) with check (true)',
      'rls_update_any_' || t, t
    );
  end loop;
end $$;
