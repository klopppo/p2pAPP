-- Fix `trade_ratings_insert_owner`.
--
-- The live policy compared the trades row's human-readable `trade_id`
-- (varchar, e.g. 'TEST-001' / 'TRD-…') against the primary key via
-- `(t.trade_id)::uuid`. Every authenticated rating INSERT that evaluates the
-- EXISTS over `trades` hits the first non-uuid trade_id and throws
--   22P02 invalid input syntax for type uuid: "TEST-001"
-- regardless of what the client sent.
--
-- The rating's `trade_id` is the uuid FK to `trades.id`; compare against that
-- directly. NOTE: the rating column MUST be qualified (`trade_ratings.trade_id`)
-- — inside the EXISTS the bare `trade_id` resolves to the inner `trades`
-- alias's varchar column and would raise `42883 uuid = character varying`.

drop policy if exists "trade_ratings_insert_owner" on public.trade_ratings;

create policy "trade_ratings_insert_owner"
  on public.trade_ratings for insert
  to authenticated
  with check (
    (rater_id = public.current_user_id())
    and exists (
      select 1 from public.trades t
      where t.id = trade_ratings.trade_id
        and (t.buyer_id = public.current_user_id()
             or t.seller_id = public.current_user_id())
    )
  );