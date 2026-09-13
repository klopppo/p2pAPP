-- OD-02 — Restricted reader: column-level public projection for the `anon` role.
--
-- The anonymous read surface (marketplace, offer detail, public profiles,
-- ratings) stays publicly readable (RLS `*_select_public` policies), but the
-- *columns* anon can SELECT are narrowed to exactly the public projection.
-- Anything excluded now returns PostgREST `42501 column X does not exist` for
-- anon requests (whether issued from a browser with the bundled anon key or
-- from the edge worker's SUPABASE_READ_KEY) — closing "read more than the UI
-- shows" scraping and heavy `select=*` joins.
--
-- The `authenticated` role keeps full table access: signed-in sessions (SIWE)
-- and the SECURITY DEFINER ownership-scoped writes are untouched. No RLS row
-- policy changes here; OD-02 is strictly a *column* projection.
--
-- The client + `functions/_lib/public-data.ts` were switched to the matching
-- explicit column lists in the same change (see done.md / ADR OD-02).
--
-- Accepted projection (excluded columns in parentheses):
--   offers: id, offer_id, seller_id, status, type, crypto_token, crypto_amount,
--           fiat_currency, fiat_amount, price_per_unit, min_amount, max_amount,
--           payment_methods, available_regions, platform_fee_bps, network_fee,
--           tags, description, is_private, target_user, grace_period,
--           published_at, expires_at, created_at
--           (excluded: views, clicks, premium_multiplier, featured, updated_at)
--   users:  id, wallet_address, nickname, avatar_url, verification_level, bio,
--           avg_rating, reputation_score, total_trades, completed_trades,
--           cancelled_trades, dispute_count, created_at
--           (excluded: role, location, website, twitter_handle, telegram_handle,
--            github_handle, last_active_at, unique_traders, updated_at,
--            total_volume, last_30d_trades, last_30d_volume)
-- NOTE: total_volume / last_30d_trades / last_30d_volume (denormalized stats)
-- are also excluded because they don't exist on the live DB yet (schema drift)
-- — granting a missing column would 42703 the migration.

-- =====================================================================
-- Implementation note (drop-and-regrant, NOT column-REVOKE):
-- PostgreSQL effective column access = table-level grant UNION column-level
-- grants. Supabase provisions `anon` with a TABLE-level SELECT, so a bare
-- `revoke select (col)` is a no-op — the table grant still allows every
-- column. To actually cut columns we must:
--   1) `revoke select` the WHOLE table from `anon` (removes the table grant),
--   2) `grant select (…)` only the accepted projection columns.
-- RLS row policies (`*_select_public`) are untouched and still gate rows.
--
-- Grants are built DYNAMICALLY against information_schema so the migration is
-- safe on older deployments where the users/offers schema drifted (e.g. a
-- missing denormalized-stat column): a column that genuinely doesn't exist
-- simply isn't granted. RETRIES note: if any step fails the `db push`
-- transaction rolls back the whole file, keeping anon's previous grants.
-- =====================================================================

-- 1. Drop table-level SELECT from `anon` (idempotent: REVOKE of a privilege
--    the role doesn't have is a no-op, not an error).
revoke select on table public.users from anon;
revoke select on table public.offers from anon;

-- 2. Grant SELECT on the projection columns that actually exist. Dynamic so a
--    drifted/missing column can't 42703 the whole migration.
do $$
declare
  col  text;
  ddl  text;
  cols text[];
  incol text;
begin
  -- users: accepted public profile projection
  cols := array['id','wallet_address','nickname','avatar_url','verification_level','bio',
                'avg_rating','reputation_score','total_trades','completed_trades',
                'cancelled_trades','dispute_count','created_at'];
  select coalesce(string_agg(quote_ident(column_name), ', ' order by ordinal_position), '')
    into ddl
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'users'
     and column_name = any(cols);
  if ddl <> '' then
    execute format('grant select (%s) on table public.users to anon', ddl);
  end if;

  -- offers: accepted public marketplace projection
  cols := array['id','offer_id','seller_id','status','type','crypto_token','crypto_amount',
                'fiat_currency','fiat_amount','price_per_unit','min_amount','max_amount',
                'payment_methods','available_regions','platform_fee_bps','network_fee',
                'tags','description','is_private','target_user','grace_period',
                'published_at','expires_at','created_at'];
  select coalesce(string_agg(quote_ident(column_name), ', ' order by ordinal_position), '')
    into ddl
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'offers'
     and column_name = any(cols);
  if ddl <> '' then
    execute format('grant select (%s) on table public.offers to anon', ddl);
  end if;
end $$;

-- =====================================================================
-- 3. Sanity audit (run manually after `supabase db push`):
--
--   select c.grantee, c.privilege_type, c.table_name, c.column_name
--   from information_schema.role_table_grants c
--   where c.grantee = 'anon'
--     and c.privilege_type = 'SELECT'
--     and c.table_schema = 'public'
--     and c.table_name in ('users','offers')
--   order by c.table_name, c.column_name;
--
-- Expected: one row per table ONLY IF a column-level grant row appears; a
-- SELECT row with NULL (table-level) must be ABSENT for both tables. Probe
-- excluded columns live: `curl .../rest/v1/users?select=role` → 42501.
-- =====================================================================