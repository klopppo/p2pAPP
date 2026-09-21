# TODO — Outstanding Work

> Active backlog. Move items to `done.md` once shipped; link the commit/PR.
> Update both files whenever work crosses a milestone.

---

## 🪙 Coffer Identity — per-trade pseudonymity (ADR-014)

> Device-bound client vault: an HKDF master derived from the (deterministic)
> SIWE signature yields opaque per-label pseudonyms. The counterparty can't
> correlate trade/chat activity to the wallet; the operator still can (chosen
> threat model: "anonimità dalla controparte", depth "layer dati" only).

- [x] **Crypto core** — `src/lib/crypt.ts` (sha256/HKDF/hex, pure WebCrypto,
      Node-testable) + `src/lib/cofferIdentity.ts` (master derive, vault
      persistence with injectable storage, `tradePseudonym` /
      `conversationPseudonym`, `rotateIdentity`, `burnCofferIdentity`).
      _(2026-09-20)_
- [x] **Sign-in integration** — `signInWithWallet` derives + persists the vault
      after the SIWE session installs; best-effort (never blocks login), never
      persists the signature. _(2026-09-20)_
- [x] **UI** — `CofferIdentityCard` on the own profile: fingerprint + sample
      trade pseudonym + Rotate/Burn (two-step inline confirms, toasts).
      _(2026-09-20)_
- [x] **Tests** — `tests/coffer-identity.spec.ts` (13 pass): determinism,
      format, per-label variance, epoch rotation, persistence/burn.
      _(2026-09-20)_
- [ ] **E2E / server-readable chat keys (OD-09)** — privacy chat UNCLOSED;
      default proposal stays server-readable-non-correlabile (keeps
      MESSAGES_INSPECTOR/AML). The vault already exposes `conversationPseudonym`
      for the corr-free handle layer.
- [x] **Metadata minimization — offer surface (OD-08, ADR-015 "Pseudo-offerta")** —
      offers browse identity-free: `users.public_handle` (random `CN-…`
      label, not derivable), `seller_id`/`target_user` out of the anon offer
      projection, parties resolved only via SECURITY DEFINER RPCs
      (`get_offer_trade_intent` / `start_offer_conversation` /
      `get_public_offers_by_seller` / `get_public_offers` /
      `get_public_offer_by_id`). Client + edge-mirror constants,
      `OffersPage`/`OpenOfferPage`/`TradePage`/`EditOfferPage`/`ProfilePage`
      handle-based; `tests/security/pseudo-offer.spec.ts` (13 pass).
      _(2026-09-20)_
- [ ] **Metadata minimization — residual (OD-08)** — a signed-in platform user
      can still read an offer's owner uid (required by the owner-scoped offer
      UPDATE policy). Close via the OD-09 chat/server-hardening phase; message
      rows still keyed to raw wallets server-side.
- [ ] **Non-correlabile transport (OD-07)** — 1-hop relay path for escrow
      funding so deposit txs don't scan back to the pseudonym; deferred by the
      "layer dati" depth choice.
- [ ] **Vault hardening** — passphrase-locked slot + optional memory-only
      (sessionStorage) mode; cross-tab rotation propagation.

---

> Client error reporting end-to-end: browser → edge → SQL. Errors are scrubbed
> (addresses/emails/query values) in two places, rate-limited per IP, and
> stored under RLS with `anon` INSERT-only.

- [x] **Client capture + scrub + batch** — `src/lib/errorReports.ts` (pure:
      scrub / fingerprint / normalise, unit-tested) + `src/error-logger.ts`
      (window `error`/`unhandledrejection` listeners, fingerprint dedupe,
      `keepalive`/`sendBeacon` POST to `/api/error-report`; prod-only,
      `VITE_ERROR_REPORT=0` opt-out). _(2026-09-20)_
- [x] **React boundary** — `AppErrorBoundary` catches render errors, reports
      `react_render`, resets on route change; wired in `src/App.tsx`. _(2026-09-20)_
- [x] **Edge endpoint** — `functions/api/error-report.ts`: defense-in-depth
      re-scrub, in-memory per-IP rate limit (100/10 min), batch cap 20,
      PostgREST insert. _(2026-09-20)_
- [x] **DB** — migration `20260920000001_error_logs.sql`: RLS default-deny,
      `anon` INSERT-only / `authenticated` SELECT, indexes on
      `created_at`/`fingerprint`/`error_type`. _(2026-09-20)_
- [x] **Tests** — `tests/error-logging.spec.ts` (10 pass): scrub text,
      fingerprint stability, message extraction, truncation, report shape.
      _(2026-09-20)_
- [ ] **Operator/alerting surface** — a dashboard or view over `error_logs`
      (`authenticated` SELECT is granted) + email/telegram alerting on spikes
      (reuse the notification channels).
- [ ] **Retention** — scheduled purge of `error_logs` older than N days
      (suggest 30) + optional nightly dedupe/coalesce by fingerprint.
- [ ] **Edge rate-limit hardening** — move the IP bucket to KV/Durable
      Objects; revisit if a single isolate ever gets abused.

---

## 🔴 Ethereum mainnet — ops follow-ups (2026-09-19)

- [ ] **Transfer factory ownership off the exposed deployer key** —
      `KlerosEscrowFactory 0x6f0fDB32EA0AB1869B14f7eC3c6e09d0594346E7` is owned by
      `0xcaDF076fACB5eE1C429a621b8d9e0e0dd138Da1d` (a key that has been shared in
      chat). Anyone with it can `setPendingFee` / `setTreasury`. Move it to a
      fresh address (ideally a Safe):
      `cast send <factory> "transferOwnership(address)" <FRESH_OR_SAFE> --rpc-url https://ethereum-rpc.publicnode.com --private-key $PRIVATE_KEY`.
- [ ] **Treasury == deployer blocks escrows with that address** — `createEscrow`
      reverts `InvalidTreasury()` when `buyer`/`seller` equals `treasury`
      (`0xcaDF076…`). Either change the treasury to a dedicated address, or only
      trade with buyer/seller addresses that differ from it. Client-side UX
      guard landed (2026-09-20): `InvalidTreasury()` added to
      `KLEROS_ESCROW_FACTORY_ABI` (decodes instead of "signature not found") +
      pre-flight popup in `TradePage`; ops resolution (dedicated treasury /
      avoid the address) still open.

---

## 🌍 Referral program ("Invite & Earn") — ADR-009

- [x] **Server credit on escrow release** — migration `20260915000005_referral_program.sql`:
      `referral_codes` + `referral_relations` + `referral_fee_events`, RPCs
      (`get_or_create_referral_code`, `claim_referral`, `credit_referral_fee`),
      SECURITY DEFINER release-trigger, owner-scoped RLS, `calculate_fee_split`
      mirrored in `src/lib/referral.ts`. _(2026-09-15)_
- [x] **Client surface** — `InviteEarnCard` on own profile (link + copy, share
      badge, pending/total ledger, friends list), `/r/:code` `ReferralLandingPage`,
      automatic claim in `useSyncUser` on first authenticated session.
      _(2026-09-15)_
- [x] **Tests** — `tests/referral.spec.ts` (maths/code/URL) +
      `tests/security/rls-referral.spec.ts` (fail-closed RLS + server-only
      credit); `rls-model` CORE*TABLES extended. *(2026-09-15)\_
- [ ] **Payout/withdraw flow (OD-06)** — `pending` → `paid` transition UI and a
      withdraw ledger or on-chain settlement for the referrer.
- [ ] **Referral i18n for non-`en` locales** — `referral.*` keys exist in `en`
      only; mirror `es/fr/tr/zh`.
- [ ] **Referral FAQ + docs page** — explain share %, attribution, and the
      GDPR posture in the marketing/docs surface.

---

## 🔴 High priority — Security P1 (see `security-audit.md` for detail)

> P0 items shipped 2026-08-29 (email relay + reputation RPC). The SIWE edge
> function + RLS rewrite shipped 2026-08-29 but **requires a coordinated
> deploy** (see ⚠ cutover below). Penetration-test matrix + vitest suite
> shipped 2026-08-30 (see `penetration-test-matrix.md`; `npm run test --
tests/security`). Remaining roadmap below is tracked here.

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

## 🚀 Frontend — Fase 0→3 (see `docs/adr.md` ADR-001…006 / OD-01…05)

- [x] **Fase 0A — Route-level code splitting** — `React.lazy` per route; layouts as Suspense boundaries; `AppPageFallback` skeleton. Entry chunk 1.9→0.11 MB. _(ADR-001, 004; 2026-09-13)_
- [x] **Fase 0B — Lazy i18n** — `en` bundled, others via `import.meta.glob`; verified by switching to `es` in browser. _(ADR-002; 2026-09-13)_
- [x] **Fase 0C — Vendor chunk buckets** — `manualChunks` (`web3/charts/ipfs/ui/backend/data/fx/react`), `chunkSizeWarningLimit` 500 KB. _(ADR-003; 2026-09-13)_
- [x] **Fase 0D — Browser verification baseline** — Playwright/Chromium smoke over `/`, `/app/offers`, `/app/trades`, `/docs`, language switch. _(ADR-006; 2026-09-13)_
- [ ] **Promote the Playwright smoke to `tests/e2e/` + CI** — formalize the ad-hoc script `ADR-006` used (route × chunk × i18n assertions) behind `npm run test:e2e`.
- [x] **Fase 2 — Per-route edge behaviour (code in repo)** — `functions/_middleware.ts` + `public/_routes.json`: public routes get shell + `__EDGE_DATA__` + `s-maxage`/SWR, private routes `no-store`; `src/lib/edgeData.ts` seeds react-query pre-render (wins over snapshot via `skipExisting`). Verified by `npm run test:e2e`. _(OD-03, ADR-007; 2026-09-13)_
- [x] **Fase 2 — Cache invalidation endpoint** — `functions/api/cache-purge.ts` (`PURGE_SECRET`-guarded, offers→marketplace+detail, users→profile). _(OD-04; 2026-09-13)_
- [x] **Fase 2 — `_headers` security baseline** — CSP, HSTS-adjacent headers, frame-ancestors, referrer-policy, COOP/CORP; immutable caching for `/assets/*`. _(OD-05 partial; 2026-09-13)_
- [x] **Fase 2 — Cookie-derived per-route cache keys** — `coffernode_session` cookie mirror (wallet identity) + `functions/_lib/cache-key.ts` deriving `ck:v1:<route>:<sha256(identity)[0..16]>`; middleware stamps `x-cache-key` on every document and shards the public CDN per cookie (`Vary: Cookie`); private routes stay `no-store`. Verified by `tests/route-cache-key.spec.ts` (12 pass). _(ADR-012; 2026-09-20)_
- [x] **Fase 2 — DEPLOY + live verify** — create Cloudflare Pages project, `wrangler pages secret put SUPABASE_READ_KEY / PURGE_SECRET`, `npm run deploy:cf`, then verify `x-edge-route` (public vs private), `s-maxage`/`no-store`, and that `/api/cache-purge` responds 401 without secret. **Runbook pronto: `docs/cloudflare-deploy.md`.** (workerd can't run locally on this mac — needs macOS ≥13.5/DevContainer or remote.) _(live 2026-09-13 → https://coffernode.pages.dev; vedi `done.md`)_
- [ ] **Fase 2 — Supabase webhooks** — configure DB webhooks on `offers`/`users` writes → `POST /api/cache-purge` with `x-webhook-secret: $PURGE_SECRET`.
- [ ] **Fase 2 follow-up — full per-route SSR/SEO HTML** — current ADR-007 injects data into the SPA shell; prerender real per-route HTML for crawlers is a follow-up.
- [x] **Fase 1 — Edge data layer (OD-02)** — restricted reader + minimal public projection: DB column-level projection for `anon` (drop-and-regrant) + worker/client explicit selects. **Carve-out:** l'anon key resta nel bundle per GoTrue (rimozione = fase BFF/OD-05). _(ADR-008; live 2026-09-13 → vedi `done.md`)_
- [ ] **BFF follow-up (OD-05 / OD-02 carve-out)** — move auth out of the anon-key path so the key can leave the bundle entirely (edge-issued short-TTL tokens / BFF proxy).
- [ ] **Fase 3 — Defer wallet stack** — lazy-mount Connect button + wallet providers on first interaction; landing/docs/offers ship without `web3` (~3 MB). _(OD-01)_
- [ ] **Offer archive follow-ups (ADR-005)** — decide: retroactive backfill of consumed offers; UNIQUE(`trades.offer_id`) double-accept guard; re-activate offer if the trade is cancelled.
- [x] **Responsive pass 320px → 4K** — full sweep of all 23 pages + 69 components at 320→4K (INP < 200 ms, nessuna rottura funzionale). Fixes: OffersPage filters wrap + search `w-full sm:max-w-xs`; LandingPage hero `flex-wrap`; CreateOffer/EditOffer Buy-Sell toggle `grid-cols-2 md:flex md:w-40`; TradePage payment row `flex-col sm:flex-row`; OperatorDashboard conversation/message headers `truncate min-w-0` + `shortAddress`, modal footers stack + `grid sm:grid-cols-3` actions, search inputs `w-full sm:max-w-xs`. Tables già scroll-orizzontale (pattern accettato). _(2026-09-13)_
