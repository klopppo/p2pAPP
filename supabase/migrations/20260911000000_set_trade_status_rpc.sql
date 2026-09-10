-- SECURITY DEFINER RPC for setting trades.escrow_status.
--
-- Why: migration 20260824000006_rls_column_restrict.sql intentionally
-- froze the status / has_dispute / escrow_status / completed_at columns
-- via the trades_update_parties WITH CHECK clause. That's a fine
-- hardening default for client-side UPDATE through PostgREST, but it
-- means the legitimate status updates from `handleConfirm` / `handleFund`
-- / etc. in TradeDetailPage silently fail — the .catch() in the page
-- logs the rejection and the trades list keeps showing the OLD state.
--
-- This RPC runs with the function owner's privileges (table owner in
-- Supabase), so it bypasses RLS for the row write. It re-applies the
-- same authorization checks (caller must be buyer or seller of the
-- trade) inside the function body so we don't open the door to arbitrary
-- writes — the surface change is exactly: parties of the trade can
-- update the trade's status columns via this function, even though the
-- row-level RLS policy still blocks raw UPDATEs.

create or replace function public.set_trade_escrow_status(
  p_trade_id          uuid,
  p_new_status        escrow_status,
  p_tx_hash           text default null,
  p_event_type        event_type default null
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
  v_existing escrow_status;
begin
  if v_caller is null then
    raise exception 'unauthenticated';
  end if;

  select buyer_id, seller_id, escrow_status
    into v_buyer, v_seller, v_existing
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
    set escrow_status = p_new_status,
        escrow_tx_hash = coalesce(p_tx_hash, escrow_tx_hash),
        updated_at = now()
  where id = p_trade_id;

  if p_event_type is not null then
    insert into public.trade_events
      (trade_id, type, actor, description, metadata)
    values
      (
        p_trade_id,
        p_event_type,
        v_caller,
        null,
        jsonb_build_object(
          'escrow_status', p_new_status,
          'tx_hash', p_tx_hash
        )
      );
  end if;
end;
$$;

-- Same idea for the (rarely-used) trade_status field — parties of the
-- trade can flip 'cancelled' / 'completed' via this RPC even though the
-- row-level RLS still freezes those columns.

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
    set status = p_new_status,
        updated_at = now()
  where id = p_trade_id;
end;
$$;

-- Grant execute on the RPCs to the client-facing roles. The functions are
-- SECURITY DEFINER so they run as the function owner, but only the
-- client-side roles can invoke them in the first place.
grant execute on function public.set_trade_escrow_status(uuid, escrow_status, text, event_type) to anon, authenticated;
grant execute on function public.set_trade_status(uuid, trade_status, text) to anon, authenticated;