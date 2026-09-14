-- Referral program ("Invite & Earn") — 2026-09-15.
--
-- Model: the referrer earns a share of the platform fee on trades where the
-- REFERRED BUYER completes a released escrow. Attribution is a one-time,
-- first-touch claim: a new wallet connects via /r/<CODE>, the code is stashed
-- in localStorage, and the first authenticated session claims it. Self-
-- referral and double-claim are rejected (UNIQUEs + explicit guards).
--
-- Reward math lives in one place (function `calculate_fee_split`) and is
-- mirrored in `src/lib/referral.ts` so the client dashboard can preview it
-- without hitting the DB. Keep the two in sync (see AGENTS box in docs/adr.md).
--
-- Privacy/compliance notes (GDPR + MiCA posture):
--   • No PII in the code/link — codes are opaque 8-hex tokens.
--   • Only the referrer/referred baskets are readable, and only by the owner
--     (claim-scoped RLS, `current_user_id()`).
--   • Credit happens server-side on escrow RELEASE (SECURITY DEFINER trigger),
--     so the client can never fabricate an earning row.
--
-- Idempotent + non-destructive; safe on partially-migrated DBs.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'referral_status') then
    create type referral_status as enum ('pending', 'active');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'referral_reward_status') then
    create type referral_reward_status as enum ('pending', 'paid');
  end if;
end $$;

-- =====================================================================
-- 2. TABLES
-- =====================================================================

-- One opaque referral code per user (the DB mints it; the client only reads).
create table if not exists public.referral_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.users(id) on delete cascade,
  code        varchar(20) not null unique
              check (code ~ '^[A-F0-9]{8}$'),
  created_at  timestamptz not null default now()
);

-- Attribution edge: who brought whom, one row per referred user.
create table if not exists public.referral_relations (
  id                uuid primary key default gen_random_uuid(),
  referrer_id       uuid not null references public.users(id) on delete cascade,
  referred_user_id  uuid not null unique references public.users(id) on delete cascade,
  code              varchar(20) not null
                    check (code ~ '^[A-F0-9]{8}$'),
  status            referral_status not null default 'pending',
  attributed_at     timestamptz not null default now(),
  check (referrer_id <> referred_user_id)
);

-- One creditable earning per released trade (UNIQUE trade_id = double-credit
-- guard). `referrer_share_bps` snapshots the share in force at credit time so
-- future program changes never rewrite past earnings.
create table if not exists public.referral_fee_events (
  id                  uuid primary key default gen_random_uuid(),
  trade_id            uuid not null unique references public.trades(id) on delete cascade,
  referrer_id         uuid not null references public.users(id) on delete cascade,
  referred_user_id    uuid not null references public.users(id) on delete cascade,
  fee_bps             int not null
                      check (fee_bps between 0 and 10000),
  fee_amount          numeric(30,18) not null
                      check (fee_amount >= 0),
  referrer_share_bps  int not null default 1500
                      check (referrer_share_bps between 0 and 5000),
  earned_amount       numeric(30,18) not null
                      check (earned_amount >= 0),
  status              referral_reward_status not null default 'pending',
  created_at          timestamptz not null default now()
);

create index if not exists idx_referral_codes_user     on public.referral_codes(user_id);
create index if not exists idx_referral_relations_ref  on public.referral_relations(referrer_id);
create index if not exists idx_referral_events_ref     on public.referral_fee_events(referrer_id, created_at desc);

-- =====================================================================
-- 3. RPCs
-- =====================================================================

-- Programme constant, mirrored in src/lib/referral.ts `REFERRER_SHARE_BPS`.
-- Returns (platform_fee, referrer_earnings) given the trade's fiat amount and
-- platform fee bps. Kept as a function so credit and (future) payout tooling
-- share one definition.
create or replace function public.calculate_fee_split(
  p_fiat_amount      numeric,
  p_fee_bps          int,
  p_referrer_share_bps int default 1500
)
returns numeric[]
language sql
immutable
set search_path = public
as $$
  select array[
    round((p_fiat_amount * p_fee_bps) / 10000.0, 2),
    round((round((p_fiat_amount * p_fee_bps) / 10000.0, 2) * p_referrer_share_bps) / 10000.0, 2)
  ]::numeric[]
$$;

-- Mint the caller's referral code (idempotent). SECURITY DEFINER: the client
-- can read but never write referral_codes directly (fail-closed RLS).
create or replace function public.get_or_create_referral_code()
returns varchar
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_user_id();
  v_code varchar;
begin
  if v_user is null then
    raise exception 'unauthenticated';
  end if;

  select code into v_code
    from public.referral_codes
   where user_id = v_user;

  if v_code is not null then
    return v_code;
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.referral_codes (user_id, code)
      values (v_user, v_code);
      exit;
    exception when unique_violation then
      -- Collision on the 32-bit code: retry with a fresh draw.
      v_code := null;
    end;
  end loop;

  return v_code;
end;
$$;

-- First-touch attribution for the CURRENT session user.
-- Guards: unauthenticated, unknown code, self-referral, double-claim.
create or replace function public.claim_referral(
  p_code varchar
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := public.current_user_id();
  v_referrer uuid;
  v_rel      uuid;
begin
  if v_user is null then
    raise exception 'unauthenticated';
  end if;

  if p_code is null or p_code !~ '^[A-Fa-f0-9]{8}$' then
    raise exception 'invalid referral code';
  end if;

  select user_id into v_referrer
    from public.referral_codes
   where code = upper(p_code)
   limit 1;

  if v_referrer is null then
    raise exception 'referral code not found';
  end if;

  if v_referrer = v_user then
    raise exception 'cannot refer yourself';
  end if;

  select id into v_rel
    from public.referral_relations
   where referred_user_id = v_user
   limit 1;
  if v_rel is not null then
    raise exception 'already referred';
  end if;

  insert into public.referral_relations (referrer_id, referred_user_id, code)
  values (v_referrer, v_user, upper(p_code));

  -- New users are immediately active (no profile-gated activation in v1).
  update public.referral_relations
     set status = 'active'
   where referred_user_id = v_user;

  return true;
end;
$$;

-- Credits the referrer when the referred BUYER's escrow is released. Called by
-- the trigger below; idempotent via the UNIQUE trade_id + on conflict.
-- NOT granted to client roles — the release path is the only way in.
create or replace function public.credit_referral_fee(
  p_trade_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade  public.trades%rowtype;
  v_rel    public.referral_relations%rowtype;
  v_share  numeric[];
  v_earned numeric(30,18);
begin
  select * into v_trade
    from public.trades
   where id = p_trade_id
   for update;

  if not found then
    raise exception 'trade not found';
  end if;

  -- Reward the referrer of the trade buyer (the party who opened the trade).
  select * into v_rel
    from public.referral_relations
   where referred_user_id = v_trade.buyer_id
     and status = 'active'
   limit 1;

  if not found then
    return false;
  end if;

  v_share := public.calculate_fee_split(
    v_trade.fiat_amount,
    v_trade.platform_fee_bps
  );
  v_earned := coalesce(v_share[2], 0);

  insert into public.referral_fee_events
    (trade_id, referrer_id, referred_user_id, fee_bps, fee_amount,
     referrer_share_bps, earned_amount)
  values
    (p_trade_id, v_rel.referrer_id, v_trade.buyer_id,
     v_trade.platform_fee_bps, v_share[1],
     1500,  -- programme share at credit time (see calculate_fee_split default)
     v_earned)
  on conflict (trade_id) do nothing;

  return found;
end;
$$;

-- =====================================================================
-- 4. RELEASE TRIGGER — credits automatically when escrow_status → released
-- =====================================================================

create or replace function public.trg_referral_fee_on_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.escrow_status = 'released' and coalesce(old.escrow_status, 'awaiting_deposit') <> 'released' then
    perform public.credit_referral_fee(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_referral_fee_on_release on public.trades;
create trigger trg_referral_fee_on_release
  after update of escrow_status on public.trades
  for each row execute function public.trg_referral_fee_on_release();

-- =====================================================================
-- 5. ROW LEVEL SECURITY — owner-scoped reads, zero client writes
-- =====================================================================

alter table public.referral_codes       enable row level security;
alter table public.referral_relations   enable row level security;
alter table public.referral_fee_events  enable row level security;

-- Own-code read only. Minting is RPC-only (get_or_create_referral_code).
drop policy if exists "referral_codes_select_own" on public.referral_codes;
create policy "referral_codes_select_own"
  on public.referral_codes for select
  to authenticated
  using (user_id = public.current_user_id());

-- Each party of a relation can see the link; writes are RPC-only (claim_referral).
drop policy if exists "referral_relations_select_self" on public.referral_relations;
create policy "referral_relations_select_self"
  on public.referral_relations for select
  to authenticated
  using (
    referrer_id = public.current_user_id()
    or referred_user_id = public.current_user_id()
  );

-- Referrer (and referred) can read earnings; only the release trigger writes.
drop policy if exists "referral_fee_events_select_self" on public.referral_fee_events;
create policy "referral_fee_events_select_self"
  on public.referral_fee_events for select
  to authenticated
  using (
    referrer_id = public.current_user_id()
    or referred_user_id = public.current_user_id()
  );

-- =====================================================================
-- 6. GRANTS
-- =====================================================================

grant execute on function public.get_or_create_referral_code()                to authenticated;
grant execute on function public.claim_referral(varchar)                       to authenticated;
-- credit_referral_fee intentionally NOT exposed to client roles: the release
-- trigger is the only entry point, so the client can never mint earnings.