-- Keep `users.avg_rating` in sync with `trade_ratings`.
--
-- `users.avg_rating` defaults to 0 and was only ever written by the initial
-- column default — submitting a rating (a `trade_ratings` INSERT) bumped
-- `reputation_score` via `increment_reputation_score` but never recomputed the
-- denormalized avg. A seller who accumulated reviews still read `avg_rating =
-- 0`, so the marketplace / trade pages fell through to "No ratings yet" for
-- people that demonstrably had reviews.
--
-- This migration:
--   1. adds a AFTER INSERT/UPDATE/DELETE trigger on `trade_ratings` that
--      recomputes `users.avg_rating` for the rated user (round(avg(score),2)
--      → 0 when they have no ratings left), and
--   2. backfills every existing `users` row that already has ratings.
--
-- The trigger is SECURITY DEFINER (function owner, not the caller) so the
-- `users` write succeeds regardless of the caller's role/RLS — the column
-- read is still gated by the OD-02 public projection.

create or replace function public.refresh_user_avg_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_avg  numeric(3,2);
begin
  v_user := coalesce(new.rated_id, old.rated_id);
  if v_user is null then
    return null;
  end if;

  select round(avg(score)::numeric, 2)
    into v_avg
    from public.trade_ratings
   where rated_id = v_user;

  update public.users
     set avg_rating = coalesce(v_avg, 0)
   where id = v_user;

  return null;
end
$$;

drop trigger if exists trg_trade_ratings_refresh_avg on public.trade_ratings;

create trigger trg_trade_ratings_refresh_avg
  after insert or update or delete on public.trade_ratings
  for each row execute function public.refresh_user_avg_rating();

-- Backfill: recompute avg_rating for every user that already has ratings so
-- existing marketplaces reflect real reviews without waiting for the next
-- insert to fire the trigger.
with agg as (
  select rated_id, round(avg(score)::numeric, 2) as avg
    from public.trade_ratings
group by rated_id
)
update public.users u
   set avg_rating = coalesce(a.avg, 0)
  from agg a
 where u.id = a.rated_id;