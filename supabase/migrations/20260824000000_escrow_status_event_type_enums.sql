-- Extend `escrow_status` with the two KlerosEsc state-machine values that
-- were missing from the original enum, and add the granular Kleros event
-- values the trade_events audit log needs.
--
-- See docs/contract-execution-status.md §B-3 (CANCELLED) and §P1-3 (Kleros
-- event values). Idempotent — safe to run on partially-migrated DBs.

-- =====================================================================
-- escrow_status: add FUNDED + CANCELLED
-- =====================================================================
--
-- FUNDED captures the on-chain KlerosEsc.State.FUNDED state (1) — buyer +
-- seller deposits in and seller has locked tradeAmount. The previous enum
-- overloaded this onto 'seller_deposited', losing the distinction.
--
-- CANCELLED captures the on-chain KlerosEsc.State.CANCELLED state (7) —
-- funding-phase mutual cancel via `cancelTrade()`. The previous code wrote
-- this as 'refunded' (which means buyer-favorable dispute payout), conflating
-- the two semantically distinct terminal outcomes.
alter type escrow_status add value if not exists 'funded';
alter type escrow_status add value if not exists 'cancelled';

-- =====================================================================
-- event_type: Kleros-specific transitions
-- =====================================================================
--
-- `transaction_type` already has `escrow_status_updated` and
-- `trade_status_updated` from 20260814000000_escrow_status_extended.sql, but
-- the audit log needs distinct values for each KlerosEsc event so the
-- (planned) server-side indexer can reconcile per-event. Postgres' `alter
-- type ... add value` does NOT take IF NOT EXISTS, so we guard each addition
-- via a `do $$ ... exception` block.
do $$
begin
  begin alter type event_type add value 'escrow_funded'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'escrow_confirmed'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'escrow_released'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'escrow_refunded'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'escrow_disputed'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'escrow_resolved'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'escrow_cancelled'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'dispute_raised'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'evidence_submitted'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'appeal_funded'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'ruling_received'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'ruling_executed'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'dispute_finalized'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'dispute_timed_out'; exception when duplicate_object then null; end;
  begin alter type event_type add value 'funds_returned'; exception when duplicate_object then null; end;
end $$;
