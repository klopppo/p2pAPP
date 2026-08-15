-- Extend `escrow_status` with the granular states the app mirrors from the
-- on-chain KlerosEsc lifecycle (see src/pages/TradeDetailPage.tsx).
--
-- Previously the app wrote 'buyer_deposited' / 'seller_deposited' / 'confirmed'
-- against an enum that only allowed the legacy coarse values, so every mirror
-- update failed silently and escrow_status never left 'awaiting_deposit'.
--
-- Safe to run repeatedly (ADD VALUE IF NOT EXISTS).

alter type escrow_status add value if not exists 'buyer_deposited';
alter type escrow_status add value if not exists 'seller_deposited';
alter type escrow_status add value if not exists 'confirmed';

-- event_type: allow generic escrow status transitions (used by the trade
-- event log when the on-chain state machine advances).
alter type event_type add value if not exists 'escrow_status_updated';

-- event_type: allow generic high-level trade lifecycle transitions (used by
-- `updateTradeStatus` in src/lib/supabase — completed/cancelled/disputed/refunded).
alter type event_type add value if not exists 'trade_status_updated';
