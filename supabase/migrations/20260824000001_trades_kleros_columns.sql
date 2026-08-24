-- Extend `trades` with the immutable per-trade mirrors the server-side indexer
-- needs so it doesn't have to re-read the chain per row. Idempotent.
--
-- See docs/contract-execution-status.md §B-10 (treasury_address) and the
-- indexer-shaped gaps captured during the 2026-08-24 cross-audit:
--   • creator — msg.sender of KlerosEscrowFactory.createEscrow()
--   • kleros_court_addr + extraData parts — factory-pinned per escrow
--   • confirmation_time, buyer_deposit_time, seller_deposit_time —
--     unix-seconds timestamps from the on-chain events

alter table public.trades
  add column if not exists creator                       varchar(42);
alter table public.trades
  add column if not exists kleros_court_addr             varchar(42);
alter table public.trades
  add column if not exists kleros_extra_data_part1       varchar(66);
alter table public.trades
  add column if not exists kleros_extra_data_part2       varchar(66);
alter table public.trades
  add column if not exists buyer_deposit_time            bigint;
alter table public.trades
  add column if not exists seller_deposit_time           bigint;
alter table public.trades
  add column if not exists confirmation_time             bigint;

-- =====================================================================
-- HOT INDEXES
-- =====================================================================
--
-- trades.escrow_contract_addr has been a hot path since v0
-- (`getTradeByEscrowAddress` is called for every dispute filing). A clean
-- migration set (created from docs/database-relational-schema.md) didn't
-- include an index here. Add one — UNIQUE since one escrow = one trade.

create unique index if not exists idx_trades_escrow_contract_addr
  on public.trades(escrow_contract_addr)
  where escrow_contract_addr is not null;

-- Optional covering columns on the creator column for the "trades I created
-- (as taker) regardless of buyer/seller" filter the disputes list may grow.
create index if not exists idx_trades_creator
  on public.trades(creator)
  where creator is not null;

-- Composite for the buyer- / seller-sorted listing pages.
create index if not exists idx_trades_kleros_court
  on public.trades(kleros_court_addr)
  where kleros_court_addr is not null;
