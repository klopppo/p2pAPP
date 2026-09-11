# TODO — Outstanding Work

> Active backlog. Move items to `done.md` once shipped; link the commit/PR.
> Update both files whenever work crosses a milestone.

---

## 🔴 High priority — Security P1 (see `security-audit.md` for detail)

> P0 items shipped 2026-08-29 (email relay + reputation RPC). The SIWE edge
> function + RLS rewrite shipped 2026-08-29 but **requires a coordinated
> deploy** (see ⚠ cutover below). Penetration-test matrix + vitest suite
> shipped 2026-08-30 (see `penetration-test-matrix.md`; `npm run test --
> tests/security`). Remaining roadmap below is tracked here.

- [x] **Penetration-test suite + matrix doc** — `tests/security/*` (63 tests:
      escrow allow/deny × ABI surface × client gates; RLS policy simulator +
      posture assertions; siwe-auth/send-email deny/allow) + `docs/penetration-test-matrix.md`. _(2026-08-30)_

- [x] **RBAC, Audit Logger Movimenti & Operator Dashboard** — Migration `002-rbac-audit-logger-operator-dashboard.sql`, `user_activity_logs`, `sys_programs`, `sys_roles`, `sys_permissions`, `sys_operators`, `user_reports`, Operator Dashboard page (`/app/operator`), and modal segnalazioni. _(2026-09-10)_

- [x] **Live test runbook** — `docs/live-test-checklist.md` (automated gates +

      manual 2-browser pass: auth, RLS cross-user, chat/notify, trade,
      dispute, retention). Automated gates P; manual pass pending user
      execution. _(2026-08-30)_

- [x] **⚠ SIWE + RLS cutover (deploy)** — `supabase functions deploy
      siwe-auth --no-verify-jwt` → `supabase db push` (20260829000002 + 20260830000000)
      → client ship, done **live 2026-08-30**. Sign-in + a full trade flow were
      exercised on the deployed build. _(code+SQL landed 2026-08-29)_
- [x] **💚 GoTrue session claim-path fix (deploy 2026-09-08)** — GoTrue mints
      JWTs with `wallet_address` NESTED under `user_metadata` (not top-level),
      so the SIWE RLS layer (`auth.jwt() ->> 'wallet_address'`) was reading
      NULL and would deny every wallet-scoped policy on a real session.
      Shipped migration `20260908000001_siwe_go_true_claim_fix.sql`
      (`current_user_id()` + `users_insert_self`/`users_update_self` read the
      nested path with a top-level fallback) + client `getSessionWallet`
      fallback. E2E verified on the deployed project: nonce → verify → GoTrue
      access_token → `/auth/v1/user` 200 → `conversations` / unread RPC 200.
- [x] **Session self-heal for pre-claim auth users (deploy 2026-09-09)** —
      auth users created BEFORE the `user_metadata.wallet_address` convention
      minted claim-less JWTs → `current_user_id()` NULL → every wallet-scoped
      RLS policy silently denied (message sends, "Conversation not found" on
      first DM, empty notifications). Fixed via (a) `ensureWalletMetadata`
      backfill in `siwe-auth` on every verify AND (b) client `getSessionWallet`
      no longer treating a claim-less token / `siwe:last` marker as proof of
      session, forcing a fresh sign-in that regenerates a claim-bearing token.
      (c) `refreshToWalletClaim` boot self-heal exchanges the refresh token for
      pre-backfill sessions (verified live end-to-end with a temp `diag`
      function: minted token carries the claim, `current_user_id` 200,
      prefs/conversations reads 200). `siwe-auth` deployed; client side needs
      an app reload. See `done.md` 2026-09-09.
- [ ] **Resend key rotation** — key present in `.env.local` (gitignored);
      move to `supabase secrets set`, placeholder in tracked env files, rotate. _(ops)_
- [x] **SIWE edge function + session issuance** — `supabase/functions/siwe-auth`
      (nonce issue/verify, viem signature check, GoTrue auth user provisioning).
      Self-minted JWT is impossible on this platform (injected JWKS is
      public-only, no HS256 secret reachable), so the function now lets GoTrue
      itself mint the session via a server-side magiclink exchange
      (`generate_link` admin → `/auth/v1/verify` with anon key). _
      (deploy 2026-09-08, see 💚 below)_
- [x] **Rewrite the 26 permissive RLS policies** — users → offers → trades →
      chat → notifications → disputes/ratings/reputation, all scoped via
      `public.current_user_id()` (JWT `wallet_address` claim); default-deny
      catch-all; avatars storage owner-scoped. _(2026-08-29, deploy above)_
- [ ] **Escrow address verification** — verify `escrowByBuyer`/`escrowBySeller`
      (or `implementation()` match) against the factory before every
      approve/deposit/dispute call; hard-fail on mismatch; remove
      `queryEscrow` URL bypass; exact-amount approvals instead of `maxUint256`.
- [ ] **Message writes server-enforced** — `sender_id` from JWT only; client
      `kind` rejected (no forged system messages); participant check.
- [ ] **Mirror writes indexer-only** — `updateTradeStatus` /
      `updateDisputeOnChain` / ratings / reputation moves behind SIGNATURE-
      checked security-definer functions (or an indexer) — revoke from anon.

## 🟡 Medium priority — Security P2 (see `security-audit.md`)

- [ ] **Storage path-owner policy** for `avatars` bucket (`${auth.uid()}/...`);
      `updateUserProfile` ownership check; `avatar_url` scheme allowlist.
- [x] **`crypto.randomUUID()`** for offer/trade/dispute ids (replaces
      `Math.random()`). _(2026-09-04 — shipped as `crypto.getRandomValues`
      base36 suffix to preserve the `OFF-`/`TRD-`/`DSP-` varchar format;
      see `done.md`)_
- [ ] **Typing/presence payload trimming** — drop `nickname` from typing
      broadcasts; server-authorized channels after JWT.
- [x] **Trigger hygiene (part 1)** — `set search_path` pinned on the three
      chat SECURITY DEFINER triggers (in 20260829000002). Delete the shotgun
      `alter function ... security definer` loop in `20260626000001:15-29`.
      _(2026-08-29)_
- [x] **Client hygiene (part 1)** — SIWE signature no longer persisted to
      localStorage (`coffernode:siwe:last` stores address+issuedAt only).
      _(2026-08-29)_
- [ ] **Client hygiene (part 2)** — `userCache` → sessionStorage + LRU + purge
      on sign-out.

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
- [x] **Avatar uploads → Supabase Storage** — replaced the Helia `uploadToIpfs` (unpinned → 404 on `/profile`) with `uploadAvatar()` to a public `avatars` Storage bucket; migration `20260829000000_avatars_storage_bucket.sql`. The old "Pinata pinning" item is superseded — no external pinning service needed for avatars. Dispute evidence still uses `uploadToIpfs`. _(2026-08-29)_

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

## 🧹 2026-09-12 multi-worker audit — remaining follow-ups

> High-signal fixes shipped same day (see `done.md`). These are the audit items
> intentionally deferred.

- [ ] **SIWE in-flight cancellation** — `signInWithWallet` installs the session
      itself; a slow MetaMask approval after an account switch can overwrite the
      newer wallet's session. Thread an `isCurrent()`/`AbortSignal` into the sign
      path and re-check the connected address before `setSession`.
- [ ] **Origin-bound SIWE** — the challenge URI is hardcoded to
      `https://coffernode.app` regardless of `window.location`, and the nonce is
      not origin-bound server-side (EIP-4361 violation; replayable from a
      phishing origin). Bind nonce→origin and verify `Origin`/domain on `/verify`.
- [ ] **De-dupe SIWE prompts** — `useSyncUser`, `SignInPrompt`, and the navbar
      button can each start a sign-in; add a module-level single-flight promise
      keyed by address.
- [ ] **Dispute `?escrowAddress=` trust** — the dispute page pays
      `arbitrationCost` to an arbitrary escrow from the query string; validate it
      against the factory's `escrowBy*` / the loaded `useUserEscrows()` list.
- [ ] **Dispute escrow selector** — `DisputePage` silently defaults to
      `userEscrows[0]`; add a real `FullDropdown` selector.
- [ ] **Marketplace pagination** — `useOffers` fetches only the first 50 rows;
      convert to `useInfiniteQuery` so "Load More" pages past 50.
- [ ] **Operator dashboard i18n + shadcn dialogs** — the operator surface is
      hardcoded Italian and uses raw `<div>` overlays instead of Radix Dialog.
- [ ] **Mock court auto-rule** — the Sepolia `MockKlerosCourt` never calls
      `KlerosEsc.rule()`, so `executeRuling()` is unreachable for 30 days; add a
      dev action or a court that calls back.
- [ ] **Raw `<div>`/a11y sweep** — remaining clickable divs, unlabeled
      icon-only buttons, and `htmlFor` labels pointing at non-existent ids
      (`CreateOfferPage`/`EditOfferPage` dropdown triggers).

## ⚪ P3 — Stretch

- [ ] **Server-side indexer** — Supabase edge function watching `KlerosEsc` events to mirror state, so disputes update even when no one is viewing them.
- [ ] **Multicall in `useEscrowState`** — already converted to viem `multicall` (single round-trip for 24 fields). _(2026-08-22)_ — needs `confirmationTime` and `treasury` added (see B-6).
- [ ] **Evidence file encryption** — DB schema has `file_encrypted` columns; UI stores plaintext CID. Decide real crypto + storage approach. (`dispute_evidence` columns are currently mis-named: `file_hash` stores the IPFS CID, `file_encrypted` stores the gateway URL — see `contract-execution-status.md` §B4 + `dispute-status.md` Bug #4.)