-- Security P0 hardening — see docs/security-audit.md.
--
-- Incrementally closes the most exploitable off-chain paths without waiting
-- for the SIWE/JWT rewrite (which rewrites RLS + removes these entirely).
--
-- 1. increment_reputation_score was an unauthenticated, arbitrary-argument
--    privilege sink: SECURITY DEFINER, callable by `anon`, accepting ANY
--    user_id + ANY delta. An attacker could pump or tank anyone's reputation
--    and flood the reputation_points ledger. Legit usage (submitTradeRating)
--    only ever passes deltas in [-2, +2] (see src/hooks/useReviews.ts
--    `reputationDeltaForScore`), so we hard-bind delta to ±10 and reject
--    NULL user_id — behavior identical for the real UI, fatal for abuse.
--
--    The full fix (revoke EXECUTE from anon + wallet-scoped auth) lands with
--    the SIWE JWT migration; this is the safe interim.
--
-- Idempotent: `create or replace`.

-- ---------------------------------------------------------------------------
-- 1. Bound the reputation RPC
-- ---------------------------------------------------------------------------

create or replace function public.increment_reputation_score(user_id uuid, delta integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
begin
  if user_id is null then
    raise exception 'increment_reputation_score: user_id is required';
  end if;

  -- Legit reputation deltas are score-3 for a 1-5 star rating, i.e. [-2,+2].
  -- A wider bound (±10) tolerates future scoring changes while making the
  -- arbitrary +/-10000 abuse fatal.
  if delta is null or delta < -10 or delta > 10 then
    raise exception
      'increment_reputation_score: delta % out of range [-10, 10]', delta;
  end if;

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