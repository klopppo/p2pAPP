# Contract Execution — Status

> Audit of every on-chain execution path the project exposes, against the
> frontend wiring and Supabase mirror. Three layers: smart contracts in
> `contrats/contracts/`, frontend ABI + hooks in `vite-app/src/lib/contracts.ts`
> + `vite-app/src/hooks/useDisputes.ts`, UI in `vite-app/src/pages/`.
>
> Companion to `dispute-status.md` (which covers only the dispute flow).

---

## Scope

| Contract | File | Role |
| --- | --- | --- |
| `KlerosEsc` | `contrats/contracts/KlerosEsc.sol` | Per-trade escrow clone, ERC-792 / Kleros-mediated |
| `KlerosEscrowFactory` | `contrats/contracts/KlerosEscrowFactory.sol` | EIP-1167 clone factory for `KlerosEsc` |
| `IKlerosCourt` | `contrats/contracts/IKlerosCourt.sol` | Subset of Kleros v1 court we read |
| `Escrow` | `contrats/contracts/Escrow.sol` | **Non-Kleros** escrow clone (legacy / dual-path?) |
| `EscrowFactory` | `contrats/contracts/EscrowFactory.sol` | Clone factory for `Escrow` (legacy / dual-path?) |
| `Constants` | `contrats/contracts/Constants.sol` | Shared protocol constants |

---

## ✅ Done — Execution paths with full wiring

### Happy path
- **Create escrow** — `KlerosEscrowFactory.createEscrow(buyer, seller, grace, amount, depositBps)` (`KlerosEscrowFactory.sol:153`). Wired in `src/pages/TradePage.tsx:189` — reads token decimals, base-units conversion, decodes `EscrowCreated` event for clone address, links to Supabase trade row.
- **Buyer deposit** — `KlerosEsc.depositBuyerSecurityDeposit()` (`KlerosEsc.sol:273`). `TradeDetailPage.tsx:223` triggers `approve(escrow, deposit)` then calls.
- **Seller deposit** — `KlerosEsc.depositSellerSecurityDeposit()` (`KlerosEsc.sol:285`). `TradeDetailPage.tsx:242` in sequence before `lockFunds`.
- **Lock funds** — `KlerosEsc.lockFunds()` (`KlerosEsc.sol:297`). `TradeDetailPage.tsx:248`.
- **Confirm** — `KlerosEsc.confirm()` (`KlerosEsc.sol:350`). `TradeDetailPage.tsx:260`. Mirrors `escrow_status='confirmed'` on Supabase.
- **Release** — `KlerosEsc.release()` (`KlerosEsc.sol:357`). `TradeDetailPage.tsx:283`. Mirrors trade → `completed` / `released`.

### Dispute flow
- **Raise** — `KlerosEsc.raiseDispute()` (`KlerosEsc.sol:380`). `DisputePage.tsx` with attached `arbitrationCostWei`.
- **Submit evidence** — `KlerosEsc.submitEvidence(bytes32)` (`KlerosEsc.sol:611`). `DisputePage.tsx` after raise.
- **Appeal** — `KlerosEsc.appeal()` (`KlerosEsc.sol:419`). `DisputeDetailPage.tsx`, gated on `useAppealInfo`.
- **Execute ruling** — `KlerosEsc.executeRuling()` (`KlerosEsc.sol:485`). `DisputeDetailPage.tsx`.
- **Finalize** — `KlerosEsc.finalize()` (`KlerosEsc.sol:539`). `DisputeDetailPage.tsx`.
- **Timeout dispute** — `KlerosEsc.timeoutDispute()` (`KlerosEsc.sol:560`). `DisputeDetailPage.tsx`.

### Reads / derived data
- **Factory listing** — `KlerosEscrowFactory.escrowByBuyer` / `escrowBySeller` paginated getters. `useUserEscrows`.
- **Escrow state** — `KlerosEsc.token/buyer/seller/klerosCourt/.../state/klerosDisputeID/currentRuling/...` (23 fields). `useEscrowState`.
- **Arbitration cost** — `KlerosCourt.arbitrationCost(extraData)`. `useArbitrationCost`.
- **Appeal cost + period + status** — `KlerosCourt.appealCost` / `appealPeriod` / `disputeStatus`. `useAppealInfo`.

### DB mirroring
- Trade status updated on every state transition via `updateTradeStatus(id, status, { escrowStatus, txHash })`.
- Dispute row updated via `updateDisputeOnChain(id, partial)` after each on-chain action (added 2026-08-22).
- `dispute_evidence` rows inserted per uploaded IPFS file (added 2026-08-22).

---

## ❌ Missing / Gap

### Funding-phase UX
- ✅ **`KlerosEsc.cancelTrade()` UI** — `TradeDetailPage.tsx`, gated on `KlerosEscState.AWAITING_FUNDING` + 1-day timelock via `CANCEL_TIMELOCK_SECONDS` (added 2026-08-22).
- ❌ **`unlockAfterTimeout()` parity** — `KlerosEsc` (active) has **no** `unlockAfterTimeout()`; the function only exists in the deprecated `Escrow.sol`. If a seller's counterparty buys but never raises a dispute or confirms, the seller cannot recover. In the legacy variant the seller can `unlockAfterTimeout()` after `7 × gracePeriod` (`Escrow.sol:322`). The Kleros variant gets around this by allowing either party to `raiseDispute()` from `FUNDED` — but doing so costs ETH (arbitration fee), even when the dispute is unwanted. **Decision needed**: either (a) add `unlockAfterTimeout()` to `KlerosEsc.sol` mirroring the legacy version, or (b) document the ETH-cost workaround as the intended UX.

### Post-completion UX
- ✅ **Rating UI** — `ReviewForm` already wired; `useSubmitRating` calls `updateUserReputation` on submit (delta = score - 3, bounded -2..+2).
- ✅ **Reputation update** — `release()` bumps both parties +3; `executeRuling()` bumps winner +2 / loser -3.
- ✅ **ProfilePage reputation breakdown** — `ProfileReputationCard` reads `reputation_scores` (overall + 5 axes + earned/lost). `ProfileRatingsCard` uses `RatingBreakdown`.

### Evidence flow
- ❌ **`submitEvidence` called once per raise, not per file** — `DisputePage.tsx:312-317` hashes only the primary CID and pins one on-chain `Evidence` event. The other uploaded files land in `dispute_evidence` (Supabase) but never hit the chain. Jurors viewing on kleros.io see only one item. Decide: (a) document this clearly in the UI + i18n, or (b) ship a "Submit more evidence" flow on `DisputeDetailPage.tsx` that loops `submitEvidence` per remaining file.
- ❌ **No `evidence_group_id` on `dispute_evidence`** — `KlerosEsc.evidenceGroupID` increments per appeal (`KlerosEsc.sol:449`). Without the column, post-appeal evidence is indistinguishable from round-1 evidence. See `dispute-status.md` §5.

### Off-chain indexer (server-side)
- ✅ **`useEscrowEventWatcher` wired** into `DisputeDetailPage` so live state refreshes on `RulingReceived` / `RulingExecuted` / `Finalized` / `AppealFunded` / `DisputeTimedOut`.
- ❌ **`TradeDetailPage` has no event watcher** — counterparty `cancelTrade` / `release` / `lockFunds` / deposit events don't live-refresh. See `B-2` below.
- ❌ **`KLEROS_ESC_EVENTS_ABI` missing the financing-phase events** — `BuyerSecurityDeposited`, `SellerSecurityDeposited`, `SellerFundsLocked`, `Released`, `TradeCancelled`, `FundsReturned` (`contracts.ts:212`) are not declared. The server-side indexer will need them.
- ❌ **Server-side indexer** still missing — Supabase edge function or cron watching the eight+ relevant events so the DB updates when no one has the page open. Carried from `todo.md`.

### Performance / RPC budget
- ✅ **`useEscrowState` is one viem `multicall` round-trip** for 24 fields (was 24 sequential `readContract` calls).
- ❌ **Missing fields in the multicall**: `treasury()` (`useDisputes.ts:114`) and `confirmationTime()`. Adding `confirmationTime` unblocks a `release()` grace-period countdown UX.

### Factory owner ops (admin)
- ✅ **Foundry deploy script** — `contrats/script/DeployKlerosEscrowFactory.s.sol` deploys + configures treasury + fee in one broadcast.
- ✅ **`Makefile`** — `make deploy / verify / set-fee / accept-fee / set-treasury / accept-treasury`.
- ✅ **Admin runbook** — `docs/factory-admin-runbook.md`.
- ❌ **Factory admin ABI missing from `KLEROS_ESCROW_FACTORY_ABI`** — `setPendingFee` / `acceptFee` / `setTreasury` / `acceptTreasury` / `pendingFeeBps` / `feeChangePending` / `pendingTreasury` are absent (`contracts.ts:182-196`). An admin page built on this ABI will break; needs pre-emptive add.

### Non-Kleros `Escrow.sol` / `EscrowFactory.sol`
- ✅ **Deprecated** — banner NatSpec comments in both contracts pointing at the Kleros replacement + this doc. Files kept for reference; not wired to frontend.
- ❌ **Phantom ABI entry** — `contracts.ts:139` declares `'function unlockAfterTimeout() external'` in `KLEROS_ESC_ABI` despite the active contract not having it. No current call site, but misleading and dangerous. See `B-1` below.

### KlerosCourt ABI coverage
- `KLEROS_COURT_ABI` (`src/lib/contracts.ts:200-206`) covers 5 of the most-used IKlerosCourt methods. Missing for completeness: `createDispute`, `appeal`, `getVote`, `getJuror`. Not needed in the UI right now but worth keeping in mind if a "view court state" feature is added.
- ❌ **`IKlerosCourt.currentRuling(disputeID)` is in the ABI but never read** — the contract uses it as a sanity check in `executeRuling` (`KlerosEsc.sol:492-493`); a `useCourtRuling` hook would let the UI detect a court-driven ruling that the local cache missed.

### Schema (Supabase) gaps surfaced during this audit
- ❌ **`users` and `offers` tables are NEVER created by any migration** — `grep -l 'create table.*users\|create table.*offers' supabase/migrations/*.sql` returns 0 hits. Every other table FK-references `users(id)` / `offers(id)`. A fresh `supabase db push` will fail with `relation "users" does not exist`. Needs an init migration.
- ❌ **`trades.escrow_contract_addr` has no index** despite `getTradeByEscrowAddress()` (`supabase/index.ts:706-718`) being a hot path on dispute filing. The legacy doc migration had `idx_trades_escrow_contract`; it was dropped when `trades` was recreated.
- ❌ **`disputes.kleros_dispute_id`, `disputes.escrow_address`, `disputes.on_chain_ruling` are unindexed**.
- ❌ **`BuyerSecurityDeposited` / `SellerFundsLocked` collapse into a single `seller_deposited` enum value** — see `B-3`. The DB can't represent the on-chain `FUNDED` state without an RPC read. Need a new enum value + write path.
- ❌ **`RulingReceived` is not mirrored to `disputes.on_chain_ruling`** — only `executeRuling` and `appeal` write it (`DisputeDetailPage.tsx:321-327`). Between `RulingReceived` and `executeRuling` the cache is stale (or `null` after appeal). The `useEscrowEventWatcher` callback (`DisputeDetailPage.tsx:209-289`) doesn't write it.
- ❌ **`DisputeTimedOut` does not mirror `trades.*`** — only `disputes.*` gets updated (`DisputeDetailPage.tsx:359-382`). Compare `handleExecuteRuling` (`TradeDetailPage.tsx:316-355`) which writes `trades.status` correctly.
- ❌ **`dispute_evidence.submitted_by` defaults to `'buyer'`** (`supabase/index.ts:876`) regardless of who raised. A seller-raised dispute still tags every evidence row `'buyer'`. Needs the filer role passed explicitly.
- ❌ **`disputes.status` is never bumped to `'in_review'` after `raiseDispute`** — list filter (`DisputesListPage.tsx`) will forever return zero rows for `'in_review'`. Surfaced previously in `dispute-status.md:32` but unfixed.
- ❌ **`treasury_address` accepted by `createTrade` but never written** — `TradePage.tsx:251-266` doesn't pass it; column exists in DB. Read from factory `treasury()` and persist.
- ❌ **Schema drift vs `database-relational-schema.md`** — §17 `dispute_steps`, §18 `dispute_resolutions`, §19 `dispute_appeals` + `dispute_category` / `dispute_winner` / `escrow_action` enums are referenced but never migrated. `todo.md:30` already carries this as open.

### Bug-class cleanup
- ✅ **`reason` / `reason_category` duplication** — `DisputePage` now writes short codes to `reason` and localized labels to `reason_category`.
- ✅ **i18n key drift** — `DisputePage` uses `factoryNotConfigured` consistently; orphan keys removed.
- ❌ **`cancelTrade` writes `escrow_status='refunded'`** — `TradeDetailPage.tsx:441-444`. `cancelTrade` is a funding-phase mutual cancel (no fee, buyer wins nothing); `REFUNDED` semantics are wrong (it implies buyer-favorable). Add `EscrowStatus.CANCELLED` and use it. See `B-3`.
- ❌ **`release()` button enabled before grace period elapses** — only state is checked (`TradeDetailPage.tsx:379-380`). Needs `confirmationTime` in the multicall and a countdown gate.

---

## 🐞 Concrete bugs found

### B-1. Phantom `unlockAfterTimeout()` ABI entry (P0)

**File:** `src/lib/contracts.ts:139`.

```ts
'function unlockAfterTimeout() external',
```

**Issue:** exists only in the deprecated `Escrow.sol:322`. The active `KlerosEsc.sol` has no such function. Today no code path invokes this entry — `grep unlockAfterTimeout src` returns only this declaration. **Risk:** any future change calling it would hit "function selector not found" at encode time.

**Fix:** delete the line.

### B-2. `TradeDetailPage` has no event watcher (P1)

**File:** `src/pages/TradeDetailPage.tsx` (whole file).

**Issue:** `useEscrowEventWatcher` is wired into `DisputeDetailPage` (`DisputeDetailPage.tsx:216`) but not into `TradeDetailPage`. When the counterparty `depositBuyerSecurityDeposit` / `lockFunds` / `cancelTrade` / `release` fires, the connected user's view is stale until they manually refresh. The matching financing events are also missing from `KLEROS_ESC_EVENTS_ABI` (`contracts.ts:212`).

**Fix:** (1) add `BuyerSecurityDeposited`, `SellerSecurityDeposited`, `SellerFundsLocked`, `Released`, `TradeCancelled`, `FundsReturned` to `KLEROS_ESC_EVENTS_ABI`. (2) Mount `useEscrowEventWatcher` in `TradeDetailPage` with the same handler structure.

### B-3. `cancelTrade` writes the wrong `escrow_status` (P1)

**File:** `src/pages/TradeDetailPage.tsx:441-444`.

**Issue:** `cancelTrade()` is a funding-phase mutual cancel: deposits + (if locked) tradeAmount return to their owners. No fee, no ruling. Writing `escrow_status='refunded'` mixes it up with the buyer-favorable refund path and misleads the `TradesPage` badge map (`TradesPage.tsx:94-95`).

**Fix:** add `EscrowStatus.CANCELLED = 'cancelled'` to the enum + `TradesPage` label map; use it here. Optionally split `release()` payout direction into `released` (seller-side fee) vs `refunded` (buyer-side settlement).

### B-4. `dispute_evidence.submitted_by` hardcoded `'buyer'` (P1)

**Files:** `src/lib/supabase/index.ts:876`, `src/pages/DisputePage.tsx:361-363`.

**Issue:** `insertDisputeEvidence()` defaults `submittedBy='buyer'`. A seller-raised dispute still tags every evidence row `'buyer'`; `DisputeDetailPage.tsx:806` then renders it literally.

**Fix:** resolve filer role via `escrowState.buyer === address ? 'buyer' : 'seller'` and pass it explicitly.

### B-5. `submitEvidence` called once per dispute, not per file (P1)

**File:** `src/pages/DisputePage.tsx:312-317`.

**Issue:** N uploaded files → N `dispute_evidence` rows but **one** `submitEvidence()` call with `keccak(primaryCid)`. Off-chain indexers + the Kleros UI itself see only the first CID via the `Evidence` event (`KlerosEsc.sol:181,611-614`).

**Fix:** (a) document and add a "Submit additional evidence" button on `DisputeDetailPage` that loops `submitEvidence` per remaining file, or (b) replace the loop in `DisputePage` with `Promise.all(uploads.map(...))` (N txs, expensive but unambiguous).

### B-6. `release()` button shown before grace period elapses (P2)

**File:** `src/pages/TradeDetailPage.tsx:379-380`.

**Issue:** `showRelease = liveState === CONFIRMED_PENDING` only. Contract reverts `GracePeriodNotOver` until `now >= confirmationTime + gracePeriod` (`KlerosEsc.sol:359`). Every user clicks "Release" right after confirm and sees an error toast.

**Fix:** add `confirmationTime()` to the `useEscrowState` multicall (`useDisputes.ts:114`); gate `showRelease` on `nowSecs >= escrowState.confirmationTime + escrowState.gracePeriod`; render a countdown chip while waiting.

### B-7. `isFiler` over-restricts dispute-flow actions (P2)

**File:** `src/pages/DisputeDetailPage.tsx:194-197, 544`.

**Issue:** `executeRuling()`, `finalize()`, `timeoutDispute()` are all `external nonReentrant` with no role check (`KlerosEsc.sol:485,539,560`) — anyone may call them (deliberate keeper-bot pattern). The UI hides the buttons behind `isFiler = address ∈ {buyer, seller}`. A third-party keeper cannot drive these from the app.

**Fix:** drop `isFiler` from the gate. Keep `isConnected` only.

### B-8. Factory admin setters missing from ABI (P2)

**File:** `src/lib/contracts.ts:182-196`.

**Issue:** `setPendingFee`, `acceptFee`, `setTreasury`, `acceptTreasury` not in `KLEROS_ESCROW_FACTORY_ABI`. Companion getters `pendingFeeBps`, `feeChangePending`, `pendingTreasury` also missing. Today none of this is wired, but an admin page build would have to add them in lockstep with the getters.

**Fix:** add the four setters + three getters preemptively.

### B-9. `disputes.status` not bumped to `'in_review'` (P2)

**File:** `src/pages/DisputePage.tsx:330-356`.

**Issue:** `createDispute` defaults `status: DisputeStatus.OPEN` (`supabase/index.ts:852`). `DisputePage.handleSubmit` overrides many fields but never sets `status`. Filter by `'in_review'` always returns empty. Surfaced in `dispute-status.md:32`.

**Fix:** after `createDispute` succeeds, call `updateDisputeOnChain(id, { status: DisputeStatus.IN_REVIEW })`.

### B-10. `treasury_address` never written on the trade row (P2)

**File:** `src/pages/TradePage.tsx:251-266`.

**Issue:** `createTrade({...})` accepts `treasury_address`; `TradePage` doesn't read it from the factory and doesn't pass it.

**Fix:** `publicClient.readContract({ abi: KLEROS_ESCROW_FACTORY_ABI, functionName: 'treasury' })` after the factory address is known; thread through `createTrade`.

---

## 📋 Plan (next)

1. Server-side indexer (Supabase edge function watching `RulingReceived` / `RulingExecuted` / `AppealFunded` / `Finalized` / `DisputeTimedOut` / `Released` / `FundsReturned` / `TradeCancelled`).
2. KlerosCourt ABI extension (`getVote`, `getJuror`) — only if a "view court state" feature is added.
3. §17-19 of `database-relational-schema.md` — migrate or trim (dispute steps / resolutions / appeals tables).

---

## Test coverage (Foundry)

| Suite | File | Covers |
| --- | --- | --- |
| `Escrow.t.sol` | `test/Escrow.t.sol` | Non-Kleros escrow lifecycle |
| `klerosTests.t.sol` | `test/klerosTests.t.sol` | KlerosEsc lifecycle + dispute |
| `Fuzz.t.sol` | `test/Fuzz.t.sol` | Property-based fuzzing |
| `Invariant.t.sol` | `test/Invariant.t.sol` | State-machine invariants |

Run: `forge test` from `contrats/`. Build passes (only pre-existing warnings about unused locals and mutability).