-- Pseudo-offerta (ADR-015 / OD-08): the public OFFER surface stops carrying
-- the seller's identity.
--
-- Goal: /app/offer/:id and /app/offers must not let a counterparty correlate
-- an offer back to a user uid or on-chain wallet. Chosen depth: "layer dati" —
-- we keep EACH side able to see the other AT TRADE TIME (the escrow needs the
-- counterparty wallet as an on-chain constructor arg), but browsing offers
-- must be identity-free.
--
-- What this migration does:
--   1. `users.public_handle` — an opaque, device/server-side random public
--      label (`CN-<16 hex>`) that can NOT be inverted to a wallet. Callers
--      render THIS on offer surfaces instead of uid + wallet.
--   2. Tighten the `offers` SELECT projection for BOTH client roles (anon AND
--      authenticated): drop `seller_id` and `target_user`. Drop-and-regrant
--      (the OD-02 pattern — a bare revoke is a no-op while a table-level
--      grant exists). `users` keeps its projection and gains `public_handle`.
--   3. RPC `get_offer_trade_intent(offer_id)` — SECURITY DEFINER, resolves the
--      parties SERVER-SIDE (no client-supplied seller). Returns
--      buyer/seller id + wallet ONLY to a signed-in, non-seller caller = the
--      wallet reveal is deferred to trade intent ("rivelato solo allo scambio").
--   4. RPC `start_offer_conversation(offer_id)` — SECURITY DEFINER, creates /
--      reuses the buyer↔seller conversation server-side from the offer, so
--      the public page never needs the seller id for the chat button.
--
-- Idempotent: `add column if not exists`, DO-block backfill, drop-and-regrant
-- (REVOKE of a privilege the role doesn't have is a no-op), `create or
-- replace` functions, `drop policy`/grant guard where relevant.

-- =====================================================================
-- 1. users.public_handle
-- =====================================================================

alter table public.users
  add column if not exists public_handle text;

-- Backfill: assign a fresh random opaque handle to every existing row.
-- Retries on the rare unique collision (12 hex chars ≈ 48 bits).
do $$
declare
  v_id      uuid;
  v_handle  text;
begin
  loop
    select u.id into v_id
      from public.users u
      where u.public_handle is null
      limit 1;
    exit when v_id is null;

    loop
      v_handle := 'CN-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
      begin
        update public.users set public_handle = v_handle where id = v_id;
        exit;
      exception when unique_violation then
        null; -- collision — try a fresh random handle
      end;
    end loop;
  end loop;
end $$;

alter table public.users
  alter column public_handle set not null;
alter table public.users
  alter column public_handle set default ('CN-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
alter table public.users
  add constraint users_public_handle_key unique (public_handle);

-- =====================================================================
-- 2. Tighten the public SELECT projection (anon + authenticated)
-- =====================================================================
--
-- Effective column access = table-level grant UNION column-level grants, so a
-- bare `revoke select (col)` is a no-op while the table grant exists. The
-- OD-02 migration already did this for `anon`; here we re-run it for BOTH
-- roles with the tightened offers list and the new users list (including
-- public_handle), keeping the dynamic information_schema guard so a drifted
-- schema can't 42703 the migration.

do $$
declare
  r   text;
  ddl text;
begin
  -- Drop table-level SELECT for both roles (idempotent).
  foreach r in array array['anon', 'authenticated'] loop
    execute format('revoke select on table public.users from %s', r);
    execute format('revoke select on table public.offers from %s', r);
  end loop;

  foreach r in array array['anon', 'authenticated'] loop
    -- users: public profile projection + public_handle
    select coalesce(string_agg(quote_ident(column_name), ', ' order by ordinal_position), '')
      into ddl
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'users'
       and column_name = any(array[
        'id','wallet_address','public_handle','nickname','avatar_url','verification_level',
        'bio','avg_rating','reputation_score','total_trades','completed_trades',
        'cancelled_trades','dispute_count','created_at']);
    if ddl <> '' then
      execute format('grant select (%s) on table public.users to %s', ddl, r);
    end if;

    -- offers: public marketplace projection WITHOUT seller_id / target_user.
    -- EXCEPTION — `authenticated` KEEPS column-level SELECT on seller_id and
    -- target_user because the owner-scoped UPDATE policy evaluates
    -- `seller_id = current_user_id()` (20260829000002) and the edit page
    -- re-reads its private rows' target_user. Column privileges on those
    -- columns would 42501 the policy qualifier, breaking every offer edit.
    -- The pseudo-anonymity guarantee is therefore: anonymous readers are
    -- identity-free; an authenticated trader can still see an offer's owner
    -- uid — equivalent to what get_offer_trade_intent reveals to a
    -- counterparty at trade time ("layer dati", OD-08 / OD-09 still open).
    select coalesce(string_agg(quote_ident(column_name), ', ' order by ordinal_position), '')
      into ddl
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'offers'
       and column_name = any(array[
        'id','offer_id','status','type','crypto_token','crypto_amount','fiat_currency',
        'fiat_amount','price_per_unit','min_amount','max_amount','payment_methods',
        'available_regions','platform_fee_bps','network_fee','tags','description',
        'is_private','grace_period','published_at','expires_at','created_at']
        || case when r = 'authenticated'
                then array['seller_id','target_user']
                else array[]::text[] end);
    if ddl <> '' then
      execute format('grant select (%s) on table public.offers to %s', ddl, r);
    end if;
  end loop;
end $$;

-- =====================================================================
-- 3. RPC: get_offer_trade_intent — server-resolved parties at trade intent
-- =====================================================================

create or replace function public.get_offer_trade_intent(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer         offers%rowtype;
  v_taker         uuid;
  v_is_maker_buyer boolean;
  v_buyer_id      uuid;
  v_seller_id     uuid;
  v_buyer_wallet  text;
  v_seller_wallet text;
begin
  select * into v_offer from public.offers where id = p_offer_id;
  if v_offer.id is null then
    raise exception 'offer not found' using errcode = 'P0002';
  end if;
  if v_offer.status is distinct from 'active'::offer_status then
    raise exception 'offer not active' using errcode = 'P0200';
  end if;
  if v_offer.expires_at is not null and v_offer.expires_at < now() then
    raise exception 'offer expired' using errcode = 'P0201';
  end if;

  v_taker := public.current_user_id();
  if v_taker is null then
    raise exception 'sign in required' using errcode = 'P0002';
  end if;
  if v_taker = v_offer.seller_id then
    raise exception 'cannot trade with yourself' using errcode = 'P0202';
  end if;

  v_is_maker_buyer := (v_offer.type = 'buy'::offer_type);
  v_buyer_id  := case when v_is_maker_buyer then v_offer.seller_id else v_taker end;
  v_seller_id := case when v_is_maker_buyer then v_taker            else v_offer.seller_id end;

  select wallet_address into v_buyer_wallet  from public.users where id = v_buyer_id;
  select wallet_address into v_seller_wallet from public.users where id = v_seller_id;

  return jsonb_build_object(
    'offer_id',  v_offer.id,
    'status',    v_offer.status,
    'type',      v_offer.type,
    'buyer_id',  v_buyer_id,
    'seller_id', v_seller_id,
    'buyer_wallet',  v_buyer_wallet,
    'seller_wallet', v_seller_wallet,
    'taker_role', case when v_is_maker_buyer then 'seller' else 'buyer' end
  );
end;
$$;

-- Only signed-in callers may resolve parties: the wallet reveal is gated to
-- trade intent.
revoke all on function public.get_offer_trade_intent(uuid) from public;
grant execute on function public.get_offer_trade_intent(uuid) to authenticated;

-- =====================================================================
-- 4. RPC: start_offer_conversation — server-resolved chat on the offer page
-- =====================================================================

create or replace function public.start_offer_conversation(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer offers%rowtype;
  v_taker uuid;
begin
  select * into v_offer from public.offers where id = p_offer_id;
  if v_offer.id is null then
    raise exception 'offer not found' using errcode = 'P0002';
  end if;

  v_taker := public.current_user_id();
  if v_taker is null then
    raise exception 'sign in required' using errcode = 'P0002';
  end if;
  if v_taker = v_offer.seller_id then
    return null; -- chatting with yourself: no conversation
  end if;

  return public.get_or_create_direct_conversation(v_taker, v_offer.seller_id);
end;
$$;

revoke all on function public.start_offer_conversation(uuid) from public;
grant execute on function public.start_offer_conversation(uuid) to anon, authenticated;

-- =====================================================================
-- 5. RPC: get_public_offers_by_seller — anon-safe listing of a seller's offers
-- =====================================================================
--
-- Profile pages (incl. anonymous ones) render a seller's offers. The old
-- client path filtered `offers` by `seller_id = <uid>` — impossible now that
-- `anon` has no SELECT on that column (and would leak it if it did). This
-- SECURITY DEFINER RPC looks the seller up by its opaque `public_handle` and
-- returns the SAME identity-free projection the marketplace uses.
--
-- result: jsonb array of { <public offer cols>, seller:{<public seller join>} }

create or replace function public.get_public_offers_by_seller(p_public_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_id uuid;
  v_result   jsonb;
begin
  select u.id into v_seller_id
    from public.users u
   where u.public_handle = p_public_handle;
  if v_seller_id is null then
    return '[]'::jsonb;
  end if;

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
       where o.seller_id = v_seller_id
         and o.status = 'active'::offer_status
         and (o.expires_at is null or o.expires_at >= now())
       order by o.published_at desc
    ) t;
  return v_result;
end;
$$;

revoke all on function public.get_public_offers_by_seller(text) from public;
grant execute on function public.get_public_offers_by_seller(text) to anon, authenticated;

-- =====================================================================
-- Sanity audit (run manually after `supabase db push`):
--
--   select c.grantee, c.privilege_type, c.table_name, c.column_name
--   from information_schema.role_table_grants c
--   where c.grantee in ('anon','authenticated')
--     and c.privilege_type = 'SELECT'
--     and c.table_schema = 'public'
--     and c.table_name in ('users','offers')
--   order by c.grantee, c.table_name, c.column_name;
--
-- Expected: `offers` grants for `anon` contain NO `seller_id` and NO
-- `target_user`; `authenticated` keeps those TWO extra columns (owner-scoped
-- UPDATE policy + private-offer re-read); both roles grant `users` incl.
-- `public_handle`; no row with a NULL column_name (table-level SELECT) for
-- either table/role.
-- =====================================================================