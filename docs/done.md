# Done — Shipped Work Log

> Reverse-chronological log of milestones. Add the most recent entry at the
> top. Cross-link the related plan item from `todo.md` so the audit trail is
> visible.
>
> Format: `## <short title> — <YYYY-MM-DD>` then a 1-3 line summary plus the
> files / migration / commit range that landed it.

---

## Debug checklist pass — 2026-08-24

Closed the three gaps from the cross-stack debugging checklist (chainId
guard, friendly write-error helper, SIWE replacement for magic link) plus
ran the full list against the codebase to confirm what's already in place.

**Chain guard (§2 Network Mismatch)**
- `src/lib/chain.ts` — reads `VITE_EXPECTED_CHAIN_ID`, resolves the wagmi
  chain descriptor, exposes `isOnExpectedChain(chainId)`.
- `src/lib/useExpectedChain.ts` — hook variant for catch-blocks.
- `src/components/custom/ChainGuard.tsx` — banner with a "Switch to
  {{chain}}" CTA that calls `wallet_switchEthereumChain` via
  `useSwitchChain`. Mounted once at the top of `AppLayout` so all in-app
  pages are covered.
- `src/wagmi.ts` — validates `VITE_EXPECTED_CHAIN_ID` matches a supported
  chain at boot and logs a clear error if not.
- `.env.example` — new `VITE_EXPECTED_CHAIN_ID=11155111` (Sepolia) block.

**Friendly write errors (§3.4 Unhandled Promise Rejection / §2 Tx Reverts)**
- `src/lib/errors.ts` — `extractWriteError(err)` returns
  `{ kind: 'cancelled' | 'reverted' | 'network' | 'unknown', message,
  original }`. Recognises viem v2 `UserRejectedRequestError`,
  `ContractFunctionRevertedError`, `ChainMismatchError`, `HttpRequestError`,
  `TimeoutError` plus ethers/legacy `ACTION_REJECTED` codes.
- `src/lib/errorMessage.ts` — `errorMessage(err, page, t, fallbackKey)`
  routes to `errors.cancelledByUser` / `errors.networkError` /
  `errors.reverted` / `${page}.${fallbackKey}` (defaults to
  `errorGeneric`). Pages can pass an action-specific fallback
  (`confirmFailed`, `releaseFailed`, etc.) to keep existing copy.
- All `catch (err) { toast.error(...) }` blocks in `TradeDetailPage.tsx`,
  `DisputeDetailPage.tsx`, `DisputePage.tsx`, `TradePage.tsx` now route
  through `errorMessage`. MetaMask rejection → "Cancelled by user"
  toast; contract revert → "Transaction reverted: {{reason}}" toast
  with the clean `shortMessage` (e.g. `InvalidKlerosSubcourt()`).

**SIWE replacement (§3.3 Auth State Disconnect)**
- `src/lib/siwe.ts` — `buildSiweChallenge(address)`,
  `verifySiwe(message, signature, expectedAddress)`, `generateNonce()`,
  `SiweRejectedError`. Pure client-side verify via viem `verifyMessage` so
  no edge function / no server round-trip / no email server required.
- `src/lib/supabase/index.ts` — `signInWithWallet(walletAddress, {
  signMessage, verifyMessage, chainId, appName })` now generates a
  per-message nonce + Issued At, asks the wallet to `personal_sign`,
  verifies locally, and only then calls `ensureUser()`. Magic-link
  `signInWithOtp({ email: 0x…@wallet.p2p })` is gone. The previous
  behavior (which sent emails to a non-existent inbox) is fully removed.

**Locales**
- All 5 (`en`, `es`, `fr`, `tr`, `zh`) gained `errors.cancelledByUser`,
  `errors.networkError`, `errors.reverted`, `errors.fallback` and
  `chainGuard.{title,description,switchCta,switchError}`.

**Checklist status** (every other item was verified in place)

| Item | Status |
| --- | --- |
| Address case sensitivity (`wallet_address.toLowerCase()`) | ✅ already in `lib/supabase/index.ts:171/199/266/1682` |
| ABI / bytecode parity | ✅ closed in the earlier B-1/B-8 pass |
| Event listener cleanup | ✅ `useEscrowEventWatcher`, `useConversations`, `useMessages`, `useNotifications`, `useTypingIndicator` all unwind (`unwatch()` / `removeChannel(channel)`) |
| Realtime Subscription crash | ✅ all five hooks call `supabase.removeChannel(channel)` in the cleanup |
| BigNumber / BigInt | ✅ all reads cast through viem `bigint`; `Math.mulDiv` upstream |
| Stale closure on write | ✅ `refetch()` after `waitForTransactionReceipt` everywhere |
| Dynamic Tailwind purge | ✅ `rg "(\\w+-)\\$\\{"` returns no matches in `src/` |
| Multiple WagmiProviders | ✅ single mount in `src/App.tsx:39/83` |
| Web3 modal z-index | ✅ AppLayout wraps in `relative z-10`; RainbowKit modals use their own z-index internally |
| RLS permissive posture | ✅ matches dev protocol (SIWE lays groundwork for tightening, per `contract-execution-status.md` TODO) |
| CORS / Supabase Storage | n/a — uploads use IPFS via Helia, never Supabase Storage |
| Hydration mismatch | n/a — Vite SPA, no SSR |

**Files touched**
- New: `src/lib/errors.ts`, `src/lib/errorMessage.ts`, `src/lib/chain.ts`,
  `src/lib/siwe.ts`, `src/lib/useExpectedChain.ts`,
  `src/components/custom/ChainGuard.tsx`.
- Edited: `src/App.tsx` (no change — guard mounted via AppLayout instead to
  keep App.tsx narrow), `src/components/layout/AppLayout.tsx`,
  `src/lib/supabase/index.ts`, `src/pages/TradeDetailPage.tsx`,
  `src/pages/DisputeDetailPage.tsx`, `src/pages/DisputePage.tsx`,
  `src/pages/TradePage.tsx`, `src/wagmi.ts`,
  `src/locales/{en,es,fr,tr,zh}.json`, `.env.example`.

**Verification**: `npm run typecheck` clean, `npm run build` clean, ESLint
clean on every file I touched (7 pre-existing `react-refresh` warnings in
unrelated component files unchanged).

## Full contract/UI/Supabase parity pass — 2026-08-24

Closed every B-1 … B-10 bug and the matching P0 schema gaps surfaced in the
cross-audit (`docs/contract-execution-status.md` §B). One commit, eleven files
plus four new migrations.

**ABI / contracts**
- `src/lib/contracts.ts` — removed phantom `unlockAfterTimeout()` from
  `KLEROS_ESC_ABI` (B-1); added the six financing-phase events to
  `KLEROS_ESC_EVENTS_ABI` (`BuyerSecurityDeposited`, `SellerSecurityDeposited`,
  `SellerFundsLocked`, `Released`, `TradeCancelled`, `FundsReturned`, plus
  `TradeFullyFunded` and `Confirmed`); added the four factory owner setters
  (`setPendingFee`, `acceptFee`, `setTreasury`, `acceptTreasury`) and three
  pending-state getters (`pendingFeeBps`, `feeChangePending`, `pendingTreasury`,
  `owner`) to `KLEROS_ESCROW_FACTORY_ABI` (B-8).

**Types / Supabase client**
- `src/types/database.ts` — added `EscrowStatus.FUNDED` + `EscrowStatus.CANCELLED`
  + `TradeEventType` (granular Kleros event values). Extended `Dispute` /
  `DisputeEvidence` / `Trade` / `CreateTradeInput` with the indexer-shaped
  columns.
- `src/lib/supabase/index.ts` — `EscrowStatus.FUNDED` + `CANCELLED` mirrored
  here; `insertDisputeEvidence` now takes `submittedBy` (required), `keccak`,
  `txHash`, `evidenceGroupId`; `updateDisputeOnChain` writes new
  `evidenceGroupId` / `appealCount` / `raiser` / `feePaidWei` / `winner` /
  `disputeTimestamp` / `rulingReceivedTime`. New helpers: `setTradeEscrowStatus`
  (granular event type) + `mirrorDisputeToTrade` (terminal dispute → trade).
- `src/hooks/useDisputes.ts` — `useEscrowState` multicall now 27 fields (added
  `treasury` + `confirmationTime`). B-6.

**TradePage / TradeDetailPage**
- `src/pages/TradePage.tsx` — reads `treasury` + `klerosCourt` + `extraData`
  from the factory in one batched multicall, persists on `createTrade` (B-10).
- `src/pages/TradeDetailPage.tsx` — mounts `useEscrowEventWatcher` so counterparty
  actions live-refresh (B-2). `release()` button now hides until grace period
  elapses + countdown chip (B-6). `cancelTrade()` writes `EscrowStatus.CANCELLED`
  (B-3). After `lockFunds` the funding→`funded` write path uses
  `setTradeEscrowStatus` + `TradeEventType.ESCROW_FUNDED`.

**DisputePage / DisputeDetailPage**
- `src/pages/DisputePage.tsx` — bumps `disputes.status` to `'in_review'` on
  create (B-9). `insertDisputeEvidence` called with explicit filer role +
  keccak + tx hash for the primary CID (B-4). Persists `raiser` /
  `fee_paid_wei` / `dispute_timestamp` / `evidence_group_id` / `appeal_count`
  on the dispute row at create time.
- `src/pages/DisputeDetailPage.tsx` — new `SubmitMoreEvidence` component
  (B-5) lets buyer/seller pin post-appeal rounds via the on-chain
  `submitEvidence(bytes32)`. Dropped `isFiler` from the
  `executeRuling` / `finalize` / `timeoutDispute` action gate (B-7) so keeper
  bots can drive these from the app. Each handler now mirrors the trade via
  `mirrorDisputeToTrade`. The `useEscrowEventWatcher` callback writes
  `on_chain_ruling` on `RulingReceived`, status + trade mirror on
  `RulingExecuted` / `Finalized` / `DisputeTimedOut`, and bumps
  `evidence_group_id` + `appeal_count` on `AppealFunded`.

**Migrations**
- `supabase/migrations/20260101000000_init_users_offers.sql` — creates the
  `users` and `offers` tables from scratch with full RLS. Fixes the
  `relation "users" does not exist` failure on a fresh `supabase db push`.
- `supabase/migrations/20260824000000_escrow_status_event_type_enums.sql` —
  adds `funded` + `cancelled` to `escrow_status` + 15 granular Kleros
  values to `event_type`.
- `supabase/migrations/20260824000001_trades_kleros_columns.sql` — adds
  `creator`, `kleros_court_addr`, `kleros_extra_data_part1`, `kleros_extra_data_part2`,
  `buyer_deposit_time`, `seller_deposit_time`, `confirmation_time` to
  `trades` + unique index on `escrow_contract_addr`.
- `supabase/migrations/20260824000002_disputes_kleros_columns.sql` — adds
  `evidence_group_id`, `appeal_count`, `raiser`, `fee_paid_wei`, `winner`,
  `dispute_timestamp`, `ruling_received_time` to `disputes` + indexes on
  `kleros_dispute_id`, `escrow_address`, `on_chain_ruling`.
- `supabase/migrations/20260824000003_dispute_evidence_columns.sql` — adds
  `ipfs_cid` / `ipfs_url` (renames from `file_hash` / `file_encrypted` with
  backfill) + `keccak_bytes32` + `tx_hash` + `evidence_group_id` + indexes.
- `TradesPage.tsx` — `ESCROW_LABELS` map gains `funded` + `cancelled`
  badge entries.

**Verification**
- `npm run typecheck` clean, `npm run build` clean (only pre-existing node_modules
  warning from `@reown/appkit`). Files I touched lint clean (7 pre-existing
  `react-refresh` warnings in unrelated component files unchanged).

## Docs discipline + dispute status audit — 2026-08-22

- Added `docs/dispute-status.md`, `docs/todo.md`, `docs/done.md`.
- AGENTS.md updated to require doc updates after each big change.

## Contract execution audit — 2026-08-22

- Added `docs/contract-execution-status.md` mapping on-chain functions → frontend wiring → DB mirror.
- Identified gaps surfaced into `todo.md`: `cancelTrade()` UI, rating/reputation surface, `Escrow.sol`/`EscrowFactory.sol` future decision, Foundry deploy script, factory owner-ops runbook, server-side indexer, multicall conversion of `useEscrowState`, dead-code cleanup.

## TODO sweep — 2026-08-22

Closed every actionable P1 + P2 item from `todo.md`:

- **`cancelTrade()` UI** — `TradeDetailPage.tsx`: button gated on `KlerosEscState.AWAITING_FUNDING` + 1-day timelock via `CANCEL_TIMELOCK_SECONDS` (new export in `src/lib/contracts.ts`). `buyerDepositTime` + `sellerDepositTime` added to `useEscrowState` + `KLEROS_ESC_ABI`. Per-second clock via `useEffect`/`setInterval` while in funding phase. Mirrors trade → `cancelled` / `escrow_status='refunded'`. i18n key `tradeDetail.cancelTrade` added to en/es/fr/tr/zh.
- **Rating + reputation surface** — `useSubmitRating` now calls `updateUserReputation(rated_id, score - 3)` (bounded -2..+2). `TradeDetailPage.handleRelease` bumps both parties +3. `handleExecuteRuling` bumps winner +2 / loser -3. New `useUserReputation` hook reads `reputation_scores`. New `ProfileReputationCard` and `ProfileRatingsCard` components on `ProfilePage`. New `getReputationScores` helper. i18n keys for the breakdown (10 axes per locale).
- **`Escrow.sol` / `EscrowFactory.sol` deprecation** — banner NatSpec comments in both contracts pointing at the Kleros replacement + `docs/contract-execution-status.md`. No code removed.
- **`reason` / `reason_category` cleanup** — `DisputePage` now writes short code (`no_payment`, `payment_released`, `unresponsive`, `wrong_amount`, `fraud`, `other`) to `disputes.reason` and the localized label to `reason_category`.
- **i18n key drift fix** — `DisputePage` uses `factoryNotConfigured` consistently; `errorFactoryNotReady` removed from all 5 locales.
- **`useEscrowEventWatcher` wired** — `DisputeDetailPage` now refetches on `RulingReceived` / `RulingExecuted` / `Finalized` / `AppealFunded` / `DisputeTimedOut` so the page updates without button presses.
- **`useEscrowState` multicall** — converted from 24 sequential `readContract` calls into a single viem `multicall`. Same 24 fields, one round-trip. Two new fields added (`buyerDepositTime`, `sellerDepositTime`) for `cancelTrade()` UX.
- **Foundry deploy script + Makefile** — `contrats/script/DeployKlerosEscrowFactory.s.sol` deploys the factory, sets treasury, sets + accepts the initial fee in one broadcast. `contrats/Makefile` exposes `make deploy / verify / set-fee / accept-fee / set-treasury / accept-treasury`.
- **Factory admin runbook** — `docs/factory-admin-runbook.md` documents the two-step pattern, sample cast commands, auditor reads, and failure modes.
- `typecheck` clean; no new lint errors in touched files.

## Dispute flow closure — 2026-08-22

Closed all four P0 items from `todo.md`:

- `on_chain_ruling` column added via `supabase/migrations/20260822151139_disputes_on_chain_ruling.sql`.
- `updateDisputeOnChain(id, partial)` helper in `src/lib/supabase/index.ts`; called from `executeRuling`, `finalize`, `timeoutDispute`, and the new `appeal` handlers in `DisputeDetailPage.tsx`.
- `insertDisputeEvidence(disputeId, files[])` helper; `DisputePage.tsx` now writes one row per uploaded IPFS file and stops packing the image list into the `description` blob.
- `appeal()` button in `DisputeDetailPage.tsx` — `useAppealInfo(escrowAddress, klerosDisputeId)` hook reads `appealCost` + `appealPeriod` from KlerosCourt, exposes `appealable` (status=1 AND in window). Cost displayed inline in ETH. i18n keys (`disputeDetail.appeal*`) added in en/es/fr/tr/zh.
- i18n keys for `appeal`/`appealFunded`/`appealFundedError` added across all five locales.
- `Dispute` interface in `src/types/database.ts` gains `on_chain_ruling?: number | null`.
- `typecheck` clean; no new lint errors introduced (pre-existing 23 errors in unrelated files untouched).

## Disputes/ratings/reputation schema — 2026-08-14

- Migration `supabase/migrations/20260814000001_disputes_ratings_reputation.sql`.
- Tables: `disputes`, `dispute_evidence`, `trade_ratings`, `reputation_scores`, `reputation_points`, `reputation_badges`, `reputation_recent_stats`.
- Enums: `dispute_status` (`open`/`in_review`/`escalated`/`resolved`/`closed`).
- RPC: `public.increment_reputation_score(user_id uuid, delta integer)`.
- RLS: permissive for `select`/`insert`/`update` on all (matches `users`/`offers`/`trades`); tighten when SIWE lands.

## Escrow status enum extension — 2026-08-14

- Migration `supabase/migrations/20260814000000_escrow_status_extended.sql`.
- Added `buyer_deposited`, `seller_deposited`, `confirmed` to `escrow_status`.
- Added `escrow_status_updated` + `trade_status_updated` to `event_type`.

## Dispute open + list + detail (UI) — 2026-08

- `src/pages/DisputePage.tsx` — IPFS upload → `raiseDispute()` + `submitEvidence()` → persist Supabase row, mirror trade to `disputed`.
- `src/pages/DisputesListPage.tsx` — filter by status, Etherscan deep-link, join buyer/seller avatars.
- `src/pages/DisputeDetailPage.tsx` — live escrow state, on-chain tx block, evidence gallery, `executeRuling`/`finalize`/`timeoutDispute` buttons.

## Dispute hooks — 2026-08

- `src/hooks/useDisputes.ts`: `useDisputes`, `useDispute`, `useUserEscrows`, `useEscrowState`, `useArbitrationCost`, `useEscrowEventWatcher` (last one currently unused — see `todo.md`).

## Frontend ABI + helpers — 2026-08

- `src/lib/contracts.ts`: `KLEROS_ESC_ABI`, `KLEROS_ESCROW_FACTORY_ABI`, `KLEROS_COURT_ABI`, `KLEROS_ESC_EVENTS_ABI`, `KlerosEscState`, `Ruling`, `RULING_LABEL`, `encodeKlerosExtraData`, `tradeKeyToBytes32`, `isFactoryConfigured`, protocol constants (`NUMBER_OF_CHOICES`, `DISPUTE_TIMEOUT_SECONDS`, etc.).

## KlerosEsc / KlerosEscrowFactory contracts — 2026-08

- `contrats/contracts/KlerosEsc.sol` — full ERC-792 dispute flow: `raiseDispute`, `submitEvidence` (ERC-1497), `appeal`, `rule` (Kleros callback), `executeRuling`, `finalize`, `timeoutDispute`. State machine: `AWAITING_FUNDING → FUNDED → CONFIRMED_PENDING → AWAITING_RULING → RULING_RECEIVED → RULING_EXECUTED → COMPLETED` (+ `CANCELLED`).
- `contrats/contracts/KlerosEscrowFactory.sol` — `createEscrow`, `escrowByBuyer`/`escrowBySeller` paginated getters, pinned config.

## i18n — 2026-08

- `src/locales/{en,es,fr,tr,zh}.json` cover `disputePage.*`, `disputeDetail.*`, `disputes.*`, plus the rest of the app. `src/i18n.ts` wires them.