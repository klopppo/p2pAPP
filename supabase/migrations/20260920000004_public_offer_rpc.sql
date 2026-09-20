-- Pseudo-offerta part 2 (ADR-015 / OD-08): public OFFER READS go through
-- SECURITY DEFINER RPCs instead of the direct REST join.
--
-- Why: browsing must stay identity-free even for anonymous visitors. Column
-- grants (20260920000003) remove `offers.seller_id` from the `anon` projection
-- — but PostgREST's FK embed `seller:users!offers_seller_id_fkey(...)` needs to
-- SELECT the FK column `offers.seller_id` to build the join, so the old direct
-- `.from('offers').select('...,seller:users!offers_seller_id_fkey(${SELLER_JOIN})')`
-- query 42501s for any caller without SELECT on `seller_id`. The RPC runs as
-- the definer, resolves the join server-side, and returns the SAME
-- identity-free projection the migration already built for
-- `get_public_offers_by_seller` — neither `seller_id` nor `target_user`, keyed
-- on the opaque `users.public_handle`.

create or replace function public.get_public_offers(p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    into v_result
    from (
      select o.id, o.offer_id, o.status, o.type, o.crypto_token, o.crypto_amount,
             o.fiat_currency, o.fiat_amount, o.price_per_unit, o.min_amount,
             o.max_amount, o.payment_methods, o.available_regions,
             o.platform_fee_bps, o.network_fee, o.tags, o.description,
             o.is_private, o.grace_period, o.published_at, o.expires_at,
             o.created_at,
             jsonb_build_object(
               'public_handle',    u.public_handle,
               'nickname',         u.nickname,
               'avatar_url',       u.avatar_url,
               'verification_level', u.verification_level,
               'total_trades',     u.total_trades,
               'avg_rating',       u.avg_rating
             ) as seller
        from public.offers o
        join public.users u on u.id = o.seller_id
       where o.status = 'active'::offer_status
         and (o.expires_at is null or o.expires_at >= now())
       order by o.published_at desc
       limit p_limit offset p_offset
    ) t;

  return v_result;
end;
$$;

revoke all on function public.get_public_offers(integer, integer) from public;
grant execute on function public.get_public_offers(integer, integer) to anon, authenticated;

create or replace function public.get_public_offer_by_id(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select row_to_json(t)::jsonb
    into v_result
    from (
      select o.id, o.offer_id, o.status, o.type, o.crypto_token, o.crypto_amount,
             o.fiat_currency, o.fiat_amount, o.price_per_unit, o.min_amount,
             o.max_amount, o.payment_methods, o.available_regions,
             o.platform_fee_bps, o.network_fee, o.tags, o.description,
             o.is_private, o.grace_period, o.published_at, o.expires_at,
             o.created_at,
             jsonb_build_object(
               'public_handle',    u.public_handle,
               'nickname',         u.nickname,
               'avatar_url',       u.avatar_url,
               'verification_level', u.verification_level,
               'total_trades',     u.total_trades,
               'avg_rating',       u.avg_rating
             ) as seller
        from public.offers o
        join public.users u on u.id = o.seller_id
       where o.id = p_offer_id
    ) t;

  return v_result;
end;
$$;

revoke all on function public.get_public_offer_by_id(uuid) from public;
grant execute on function public.get_public_offer_by_id(uuid) to anon, authenticated;

-- Pre-deploy sanity (run after `supabase db push`):
--   select public.get_public_offers(2, 0);
--   select public.get_public_offer_by_id(<id>);
-- Must NOT expose "seller_id" or "target_user" anywhere in the result.