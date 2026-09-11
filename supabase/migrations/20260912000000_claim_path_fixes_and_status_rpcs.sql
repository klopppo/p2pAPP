-- Claim-path + status-write fixes (2026-09-12).
--
-- Two classes of defect:
--
-- A) RLS predicates that still read the TOP-LEVEL `auth.jwt() ->>
--    'wallet_address'` claim. Platform GoTrue nests it under
--    `user_metadata` (see 20260908000001_siwe_go_true_claim_fix.sql), so
--    these predicates were always false on a real session:
--      - private offers were invisible to their target (`offers_select_private_parties`)
--      - avatar uploads were always denied (`avatars_self_write/update`)
--    Recreated here with the nested path + top-level fallback.
--
-- B) Terminal trade/dispute writes targeting columns revoked from
--    `authenticated` (20260824000006). `set_trade_escrow_status` already
--    exists; this adds the missing high-level `set_trade_status` timestamp
--    handling and a `set_dispute_on_chain` RPC for the revoked dispute
--    columns. SECURITY DEFINER + internal party authorization, mirroring
--    20260911000000.

-- =====================================================================
-- A1. Private offers: target must be matched via the nested wallet claim.
-- =====================================================================

drop policy if exists "offers_select_private_parties" on public.offers;
create policy "offers_select_private_parties"
  on public.offers for select
  to authenticated
  using (
    is_private = true
    and (
      seller_id = public.current_user_id()
      or lower(target_user) = lower(coalesce(
        auth.jwt() -> 'user_metadata' ->> 'wallet_address',
        auth.jwt() ->> 'wallet_address',
        ''
      ))
    )
  );

-- =====================================================================
-- A2. Avatars: storage policies must read the nested wallet claim.
-- =====================================================================

drop policy if exists "avatars_self_write"  on storage.objects;
drop policy if exists "avatars_self_update" on storage.objects;

create policy "avatars_self_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '-', 1) = lower(coalesce(
      auth.jwt() -> 'user_metadata' ->> 'wallet_address',
      auth.jwt() ->> 'wallet_address',
      ''
    ))
    and name <> ''
  );

create policy "avatars_self_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '-', 1) = lower(coalesce(
      auth.jwt() -> 'user_metadata' ->> 'wallet_address',
      auth.jwt() ->> 'wallet_address',
      ''
    ))
    and name <> ''
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '-', 1) = lower(coalesce(
      auth.jwt() -> 'user_metadata' ->> 'wallet_address',
      auth.jwt() ->> 'wallet_address',
      ''
    ))
    and name <> ''
  );

-- =====================================================================
-- B1. set_trade_status — extend to write the matching timestamp / flag.
-- =====================================================================

create or replace function public.set_trade_status(
  p_trade_id   uuid,
  p_new_status trade_status,
  p_tx_hash    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid := public.current_user_id();
  v_seller   uuid;
  v_buyer    uuid;
begin
  if v_caller is null then
    raise exception 'unauthenticated';
  end if;

  select buyer_id, seller_id
    into v_buyer, v_seller
  from public.trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'trade not found';
  end if;

  if v_caller <> v_buyer and v_caller <> v_seller then
    raise exception 'not a party of this trade';
  end if;

  update public.trades
    set status        = p_new_status,
        completed_at  = case when p_new_status = 'completed' then now() else completed_at end,
        cancelled_at  = case when p_new_status = 'cancelled' then now() else cancelled_at end,
        disputed_at   = case when p_new_status = 'disputed'  then now() else disputed_at end,
        has_dispute   = case when p_new_status = 'disputed'  then true else has_dispute end,
        escrow_tx_hash = coalesce(p_tx_hash, escrow_tx_hash),
        updated_at    = now()
  where id = p_trade_id;
end;
$$;

grant execute on function public.set_trade_status(uuid, trade_status, text) to anon, authenticated;

-- =====================================================================
-- B2. set_dispute_on_chain — SECURITY DEFINER write for the revoked
--     dispute mirror columns (status/winner/on_chain_ruling/
--     kleros_dispute_status/resolved_at).
-- =====================================================================

create or replace function public.set_dispute_on_chain(
  p_dispute_id            uuid,
  p_status                dispute_status default null,
  p_winner                text default null,
  p_on_chain_ruling       smallint default null,
  p_kleros_dispute_status smallint default null,
  p_resolved_at           timestamptz default null,
  p_clear_resolved_at     boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := public.current_user_id();
  v_buyer  uuid;
  v_seller uuid;
begin
  if v_caller is null then
    raise exception 'unauthenticated';
  end if;

  select buyer_id, seller_id
    into v_buyer, v_seller
  from public.disputes
  where id = p_dispute_id
  for update;

  if not found then
    raise exception 'dispute not found';
  end if;

  if v_caller <> v_buyer and v_caller <> v_seller then
    raise exception 'not a party of this dispute';
  end if;

  update public.disputes
    set status                = coalesce(p_status, status),
        winner                = coalesce(p_winner, winner),
        on_chain_ruling       = coalesce(p_on_chain_ruling, on_chain_ruling),
        kleros_dispute_status = coalesce(p_kleros_dispute_status, kleros_dispute_status),
        resolved_at           = case
                                  when p_clear_resolved_at then null
                                  when p_resolved_at is not null then p_resolved_at
                                  else resolved_at
                                end,
        updated_at            = now()
  where id = p_dispute_id;
end;
$$;

grant execute on function public.set_dispute_on_chain(uuid, dispute_status, text, smallint, smallint, timestamptz, boolean) to anon, authenticated;
