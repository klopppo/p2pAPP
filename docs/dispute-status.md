# Dispute Resolution — Status

> Snapshot of the dispute flow: on-chain (`KlerosEsc` + Kleros Court via
> `KlerosEscrowFactory`), off-chain (Supabase `disputes` + `dispute_evidence`),
> and the UI in `src/pages/Dispute*.tsx` / `src/hooks/useDisputes.ts`.
>
> Updated whenever the dispute flow changes — see AGENTS.md.

---

## ✅ Done

- **On-chain contracts** — `contrats/contracts/KlerosEsc.sol`, `KlerosEscrowFactory.sol`, `IKlerosCourt.sol`, `Constants.sol`.
- **Frontend ABI parity** — `src/lib/contracts.ts` exposes `KLEROS_ESC_ABI`, `KLEROS_ESCROW_FACTORY_ABI`, `KLEROS_COURT_ABI`, `KLEROS_ESC_EVENTS_ABI`, enums (`KlerosEscState`, `Ruling`), and `RULING_LABEL`.
- **Schema** — `supabase/migrations/20260814000001_disputes_ratings_reputation.sql` defines `disputes`, `dispute_evidence`, `trade_ratings`, `reputation_scores/points/badges/recent_stats`, and the `increment_reputation_score` RPC.
- **Open dispute** — `src/pages/DisputePage.tsx`: select escrow → upload IPFS evidence → `raiseDispute()` (with arbitration fee) → `submitEvidence(bytes32)` → persist Supabase row + mirror `trades.status='disputed'` / `escrow_status='disputed'`. Decodes `DisputeRaised` log to capture `kleros_dispute_id`.
- **List disputes** — `src/pages/DisputesListPage.tsx` + `useDisputes` hook; status filter, Etherscan deep-link.
- **View dispute** — `src/pages/DisputeDetailPage.tsx`: live `useEscrowState` (buyer/seller/amount/court/state/ruling), on-chain tx block, linked trade, IPFS image gallery, parties.
- **On-chain actions from detail page** — `executeRuling()`, `finalize()`, `timeoutDispute()`, **`appeal()`**.
- **i18n** — `src/locales/{en,es,fr,tr,zh}.json` cover `disputePage.*` and `disputeDetail.*`.
- **Trade-side mirror on raise** — `updateTradeStatus(linkedTrade.id, 'disputed', …)` (best-effort, non-fatal).
- **Chain → DB sync** — `updateDisputeOnChain(id, partial)` in `src/lib/supabase/index.ts` writes the cached `escrow_state`, `kleros_dispute_status`, `on_chain_ruling` columns + the app-level `status` + `resolved_at`. Wired into `executeRuling`, `finalize`, `timeoutDispute`, `appeal`.
- **`on_chain_ruling` column** — migration `supabase/migrations/20260822151139_disputes_on_chain_ruling.sql`; referenced + written by the UI.
- **`dispute_evidence` writes** — `insertDisputeEvidence(disputeId, files[])` inserts one row per uploaded IPFS file. Replaces the prior `description`-blob hack; the legacy join in the detail page now renders the actual gallery rows.
- **`useAppealInfo` hook** — reads `appealCost`, `disputeStatus`, `appealPeriod` from `KlerosCourt` and exposes `appealable` (status=1 + in window) for the UI.

---

## ❌ Missing / Gap

### On-chain → DB sync
- ❌ **`disputes.status` is never bumped to `'in_review'` after `raiseDispute`**. `createDispute` defaults `status: DisputeStatus.OPEN` (`supabase/index.ts:852`); `DisputePage.handleSubmit` overrides many fields but never sets `status`. Filter by `'in_review'` always returns empty. Fix in `DisputePage.tsx` after `createDispute` succeeds: `updateDisputeOnChain(id, { status: DisputeStatus.IN_REVIEW })`.
- ❌ **`RulingReceived` is not mirrored to `disputes.on_chain_ruling`** between `RulingReceived` and `executeRuling`. `useEscrowEventWatcher` callback (`DisputeDetailPage.tsx:209-289`) refetches state but does NOT write the cached ruling column — only `handleExecuteRuling` does. Stale `on_chain_ruling` between events (or `null` after appeal reset per `KlerosEsc.sol:445`).
- ❌ **`DisputeTimedOut` does not mirror `trades.*`** in `DisputeDetailPage.handleTimeoutDispute` (`DisputeDetailPage.tsx:359-382`). `useEscrowEventWatcher` writes nothing here either. Compare `handleExecuteRuling` (`TradeDetailPage.tsx:316-355`) which mirrors `trades.status` correctly — same pattern needed for timeout + appeal-buyer-loses paths.
- ✅ `updateDisputeOnChain` helper wired into executeRuling / finalize / timeoutDispute / appeal.
- ✅ `useEscrowEventWatcher` wired into `DisputeDetailPage` for live state refresh.
- ❌ Server-side indexer still missing — Supabase edge function or cron watching `RulingReceived` / `RulingExecuted` / `AppealFunded` / `DisputeTimedOut` so DB rows update when nobody has the page open.

### Evidence storage
- ✅ Rows are now written to `dispute_evidence`. The `file_encrypted` column still holds the IPFS gateway URL — placeholder until real encryption is wired.
- Schema column is `text` (DB uses `file_hash text not null` + `file_encrypted text not null`) but contract submission is just the keccak of the IPFS CID.
- ❌ **`dispute_evidence.evidence_group_id` missing** — `KlerosEsc.evidenceGroupID` increments per appeal (`KlerosEsc.sol:449`); without the column, post-appeal evidence is indistinguishable from round-1 evidence. Migration: `alter table dispute_evidence add column if not exists evidence_group_id integer not null default 0; create index if not exists idx_dispute_evidence_group on dispute_evidence(dispute_id, evidence_group_id);`.
- ❌ **`dispute_evidence.submitted_by` defaults to `'buyer'`** (`supabase/index.ts:876`). A seller-raised dispute still tags every evidence row `'buyer'`; `DisputeDetailPage.tsx:806` renders it literally. Pass filer role explicitly.
- ❌ **`dispute_evidence` missing `tx_hash`** — the contract's `submitEvidence(bytes32)` can be called repeatedly per round (`KlerosEsc.sol:611`) but the DB stores only `disputes.tx_hash_evidence` (single-value). Each `dispute_evidence` row should carry its own on-chain tx hash.
- ❌ **`submitEvidence` called once per dispute, not per file** — `DisputePage.tsx:312-317` hashes only the primary CID and pins one on-chain `Evidence` event. The other uploaded files land in `dispute_evidence` (Supabase) but never hit the chain. Jurors viewing on kleros.io see only one item. Decide: (a) document this clearly in the UI + i18n, or (b) ship a "Submit more evidence" flow on `DisputeDetailPage.tsx` that loops `submitEvidence` per remaining file.

### Rating + reputation UI
- ✅ `useSubmitRating` calls `updateUserReputation` (delta = score - 3).
- ✅ `release()` / `executeRuling()` handlers bump both parties' reputation.
- ✅ `ProfilePage` shows `reputation_scores` breakdown via `ProfileReputationCard`.

### Bug-class fixes
- ✅ `reason` / `reason_category` duplication fixed — short code in `reason`, full label in `reason_category`.
- ✅ i18n key drift fixed — `factoryNotConfigured` used consistently.

### Schema delta vs `docs/database-relational-schema.md`
The relational doc specs §17 `dispute_steps`, §18 `dispute_resolutions`, §19 `dispute_appeals` — none are migrated. Enums `dispute_category`, `dispute_winner`, `escrow_action` are referenced in the doc but not created. Decide: migrate them, or pare the doc back to match reality. (Still open.)
- ❌ **`users` and `offers` tables are NEVER created by any migration** — `grep -l 'create table.*users\|create table.*offers' supabase/migrations/*.sql` returns 0 hits. Every other table FK-references `users(id)` / `offers(id)`. A fresh `supabase db push` will fail with `relation "users" does not exist`. Needs an init migration.

---

## 📋 Plan (next)

1. ~~Add `updateDisputeOnChain(state, klerosStatus, ruling?)` to `src/lib/supabase/index.ts`. Wire it into the three on-chain action handlers in `DisputeDetailPage`.~~ ✅
2. ~~Fix the `on_chain_ruling` reference (option A: add the column; option B: remove the read).~~ ✅ added via new migration.
3. ~~Insert one row per uploaded file into `dispute_evidence` from `DisputePage`; drop the multi-image list from the description blob.~~ ✅
4. ~~Add the `appeal()` button — guard on `kleros_dispute_status === 1` + appeal-period window.~~ ✅
5. Decide on the indexer approach: Supabase edge function + cron vs `useEscrowEventWatcher` only when the page is open.
6. ~~Rating modal on trade completion (gated on `trades.status in ('completed','refunded')`); call `updateUserReputation` from the modal submit.~~ ✅
7. Reconcile the relational-schema doc with the migration (migrate §17-19 or trim the doc).