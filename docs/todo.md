# TODO — Outstanding Work

> Active backlog. Move items to `done.md` once shipped; link the commit/PR.
> Update both files whenever work crosses a milestone.

---

## 🔥 P0 — Dispute flow closure (see `dispute-status.md` for full detail)

- [x] **Chain → DB sync helper** — `updateDisputeOnChain(state, klerosStatus, ruling?)` in `src/lib/supabase/index.ts`; wired into `executeRuling` / `finalize` / `timeoutDispute` / `appeal`. _(2026-08-22)_
- [x] **Fix `on_chain_ruling` reference** — column added via `supabase/migrations/20260822151139_disputes_on_chain_ruling.sql`. _(2026-08-22)_
- [x] **Write to `dispute_evidence`** — `insertDisputeEvidence()` inserts one row per uploaded file from `DisputePage.tsx`; images no longer packed into `description`. _(2026-08-22)_
- [x] **`appeal()` button** — `DisputeDetailPage.tsx`, gated on `kleros_dispute_status === 1` and appeal-period window; cost via `useAppealInfo`. _(2026-08-22)_

## 🟡 P1 — Rating + reputation surface

- [x] **Rating modal** — `ReviewForm` already wired; `useSubmitRating` now calls `updateUserReputation` (delta = score - 3, bounded -2..+2). _(2026-08-22)_
- [x] **Call `updateUserReputation`** — `release()` bumps both parties +3; `executeRuling()` bumps winner +2 and loser -3. _(2026-08-22)_
- [x] **Render reputation breakdown** on `ProfilePage` — `ProfileReputationCard` reads `reputation_scores` (overall + 5 axes + points earned/lost); `ProfileRatingsCard` uses `RatingBreakdown`. _(2026-08-22)_

## 🟢 P2 — Schema reconciliation + bug-class cleanup

- [x] **`cancelTrade()` UI** — `TradeDetailPage` shows the button gated on funding-phase state + 1-day timelock. _(2026-08-22)_
- [x] **Decide `Escrow.sol` / `EscrowFactory.sol` future** — kept but DEPRECATED with banner comments pointing to the Kleros replacement. _(2026-08-22)_
- [x] **Foundry deploy script** — `contrats/script/DeployKlerosEscrowFactory.s.sol` + `contrats/Makefile` (`make deploy`, `verify`, `set-fee`, `accept-fee`, `set-treasury`, `accept-treasury`). _(2026-08-22)_
- [x] **Factory owner ops runbook** — `docs/factory-admin-runbook.md` covers fee + treasury two-step pattern, auditor reads, failure modes. _(2026-08-22)_
- [x] **Drop dead `useEscrowEventWatcher`** — wired into `DisputeDetailPage` so RulingReceived / RulingExecuted / Finalized / AppealFunded / DisputeTimedOut auto-refresh the live state. _(2026-08-22)_
- [x] **`reason` / `reason_category` duplication** — `DisputePage` now writes a short code to `reason` (`no_payment`, `payment_released`, `unresponsive`, `wrong_amount`, `fraud`, `other`) and the localized label to `reason_category`. _(2026-08-22)_
- [x] **i18n key drift** — `DisputePage` now uses `disputePage.factoryNotConfigured` consistently; orphan `errorFactoryNotReady` keys removed from en/es/fr/tr/zh. _(2026-08-22)_
- [ ] **Decide §17-19 of `database-relational-schema.md`** — migrate `dispute_steps`, `dispute_resolutions`, `dispute_appeals` + `dispute_category` / `dispute_winner` / `escrow_action` enums, or trim the doc to match what's shipped.
- [ ] **Pinata pinning** — `src/lib/ipfs.ts` returns a CID via Helia but doesn't pin. Add Pinata (or defer to server-side pinner as planned). _[Paused — server-side pinning TBD]_.

## 🆕 P0/P1 surfaced in the 2026-08-24 cross-audit (see `contract-execution-status.md` §B + `dispute-status.md`)

- [ ] **B-1 (P0)** — Delete phantom `unlockAfterTimeout()` ABI entry at `src/lib/contracts.ts:139` (function only exists in deprecated `Escrow.sol`).
- [ ] **B-2 (P1)** — Add financing-phase events (`BuyerSecurityDeposited`, `SellerSecurityDeposited`, `SellerFundsLocked`, `Released`, `TradeCancelled`, `FundsReturned`) to `KLEROS_ESC_EVENTS_ABI` and mount `useEscrowEventWatcher` in `TradeDetailPage`.
- [ ] **B-3 (P1)** — Replace `EscrowStatus.REFUNDED` write on `cancelTrade` (`TradeDetailPage.tsx:441`) with a new `EscrowStatus.CANCELLED` enum value; update `TradesPage` badge map.
- [ ] **B-4 (P1)** — Pass explicit filer role into `insertDisputeEvidence()` from `DisputePage.handleSubmit` so `dispute_evidence.submitted_by` is not hardcoded `'buyer'`.
- [ ] **B-5 (P1)** — Decide + ship: (a) clear UI copy + i18n that only the primary CID is on-chain per raise, or (b) add "Submit more evidence" loop on `DisputeDetailPage` calling `submitEvidence` per remaining file.
- [ ] **B-6 (P2)** — Add `confirmationTime()` to `useEscrowState` multicall (`useDisputes.ts:114`) and gate `release()` button on grace-period elapsed (`TradeDetailPage.tsx:379`).
- [ ] **B-7 (P2)** — Drop `isFiler` requirement from `executeRuling` / `finalize` / `timeoutDispute` action gates in `DisputeDetailPage.tsx:194, 544` so keeper bots can drive these from the UI.
- [ ] **B-8 (P2)** — Add `setPendingFee` / `acceptFee` / `setTreasury` / `acceptTreasury` + `pendingFeeBps` / `feeChangePending` / `pendingTreasury` to `KLEROS_ESCROW_FACTORY_ABI`.
- [ ] **B-9 (P2)** — Bump `disputes.status` to `'in_review'` in `DisputePage.handleSubmit` immediately after `createDispute` succeeds.
- [ ] **B-10 (P2)** — Read `treasury()` from the factory in `TradePage.tsx:251` and persist it into `trades.treasury_address`.
- [ ] **Schema (P0)** — `users` and `offers` tables are NEVER created by any migration in `supabase/migrations/`. All other tables FK-reference them. A fresh `supabase db push` fails. Ship an init migration `20260101000000_init_users_offers.sql`.
- [ ] **Schema (P0)** — Add `funded` to `escrow_status` enum + write path so `TradeFullyFunded` event has a DB mirror distinct from `seller_deposited` (currently overloaded).
- [ ] **Schema (P0)** — Add `evidence_group_id` to `dispute_evidence` + index; pass through `insertDisputeEvidence()` so post-appeal evidence can be filtered per round.
- [ ] **Schema (P0)** — Add `kleros_court_addr`, `kleros_extra_data_part1`, `kleros_extra_data_part2`, `creator`, `confirmation_time`, `buyer_deposit_time`, `seller_deposit_time` columns to `trades` so the server-side indexer doesn't have to re-read the chain per row.
- [ ] **Schema (P0)** — Add `evidence_group_id`, `appeal_count`, `raiser`, `fee_paid_wei`, `winner`, `dispute_timestamp`, `ruling_received_time` columns to `disputes`.
- [ ] **Schema (P1)** — Add unique index on `trades.escrow_contract_addr` (hot path for `getTradeByEscrowAddress`); add indexes on `disputes.kleros_dispute_id`, `disputes.escrow_address`, `disputes.on_chain_ruling`.
- [ ] **Schema (P1)** — Add new `event_type` values: `funds_returned`, `dispute_raised`, `appeal_funded`, `ruling_received`, `ruling_executed`, `dispute_finalized`, `dispute_timed_out` for granular audit trails.
- [ ] **Schema (P1)** — Decide on `dispute_category` enum vs free-text `reason_category`; either migrate or pare the doc.
- [ ] **Contract decision** — `KlerosEsc` has no `unlockAfterTimeout()` (legacy variant had it). Seller recovery for "buyer paid but never confirms" requires raising a dispute (costs ETH). Decide: add the function for parity, or document the ETH-cost workaround.

## ⚪ P3 — Stretch

- [ ] **Server-side indexer** — Supabase edge function watching `KlerosEsc` events to mirror state, so disputes update even when no one is viewing them.
- [ ] **Multicall in `useEscrowState`** — already converted to viem `multicall` (single round-trip for 24 fields). _(2026-08-22)_ — needs `confirmationTime` and `treasury` added (see B-6).
- [ ] **Evidence file encryption** — DB schema has `file_encrypted` columns; UI stores plaintext CID. Decide real crypto + storage approach. (`dispute_evidence` columns are currently mis-named: `file_hash` stores the IPFS CID, `file_encrypted` stores the gateway URL — see `contract-execution-status.md` §B4 + `dispute-status.md` Bug #4.)