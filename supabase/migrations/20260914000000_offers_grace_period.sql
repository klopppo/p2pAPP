-- Offer grace period: the escrow window after the buyer confirms the off-chain
-- payment. While `CONFIRMED_PENDING`, `release()` is gated on
-- `now >= confirmationTime + gracePeriod` and the buyer must raise a dispute
-- before the window closes. The seller picks this at offer creation.
--
-- Stored in HOURS to match the create/edit offer forms ("Grace Period (hours)")
-- and converted to seconds when the escrow is deployed (TradePage passes
-- `grace_period * 3600` to `factory.createEscrow(... gracePeriod ...)`).
--
-- Legacy offers created before this column get the previous app default of 7
-- days = 168h, so existing trades keep their behaviour.
--
-- Bounds mirror KlerosEsc's grace window (1 hour .. 365 days = 8760 hours).

alter table offers
  add column if not exists grace_period int not null default 168
  check (grace_period between 1 and 8760);