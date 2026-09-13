# Done — Shipped Work Log

> Reverse-chronological log of milestones. Add the most recent entry at the
> top. Cross-link the related plan item from `todo.md` so the audit trail is
> visible.
>
> Format: `## <short title> — <YYYY-MM-DD>` then a 1-3 line summary plus the
> files / migration / commit range that landed it.

---

## Offer auto-archived when a trade is opened — 2026-09-13

- **Product rule**: an offer is one-shot — the moment a taker opens a trade
  against it, the offer is consumed and must leave the public marketplace
  (getActiveOffers only returns `status='active'`), living on only in the
  seller's own offers table.
- **Fix** (`supabase/migrations/20260913000001_archive_offer_on_trade_created.sql`):
  new SECURITY DEFINER trigger `trg_archive_offer_on_trade_created` (AFTER
  INSERT on `trades`) flips `offers.status` → `completed` atomically with trade
  creation — no client race, works for every write path.
- **UI** (`src/pages/ProfilePage.tsx`): the seller's offers table now shows a
  status badge (`completed` / `cancelled`) on non-active offers, so consumed
  offers read as the seller's archive.

## Trade lookups accept human ids (fixes `22P02` on ratings) — 2026-09-12

- **Bug**: `trade_ratings.trade_id` is a **uuid** FK to `trades.id`, but the
  app received the human-readable `trades.trade_id` (varchar, e.g. `TEST-001`,
  `TRD-…`) from several entry points (URL param, ratings/review queries).
  Any such value fed into a uuid-typed column failed with
  `22P02 invalid input syntax for type uuid`.
- **Fix** (`src/lib/supabase/index.ts`): new `isUuid` + `resolveTradeUuid`
  helpers. `getTradeById` now targets the `trade_id` varchar column when the
  input isn't a uuid, so `/app/trades/TEST-001` resolves. `submitTradeRating`,
  `getRatingsForTrade`, and `hasUserRatedTrade` resolve human ids to the
  row's uuid before touching uuid columns; non-uuid `rater_id`/`rated_id` are
  rejected with a clear message instead of the raw Postgres error.

---

## Archived chats + trade tags in the message list — 2026-09-13

- **DB** (`20260914000000_conversation_archive.sql`): `conversations.status`
  already had an `'archived'` value but nothing set it. New trigger
  `archive_conversation_on_trade_terminal` archives a trade-linked conversation
  when the trade becomes `completed` / `cancelled` / `refunded` (direct chats,
  `trade_id IS NULL`, are never touched → profile-started chats stay
  persistent). Backfills existing terminal trades.
- **Data** (`listConversations` / `useConversations`): optional
  `{ archived?: boolean }` — `undefined` = all (profile/offer lookups),
  `false` = active inbox, `true` = archive. `useConversations` also takes
  `{ enabled }` so the archive query is only mounted when the view opens;
  query key gained a view segment.
- **UI** (`ConversationList` / `ChatLayout`): an **"Archived"** row at the top
  of the inbox opens a separate archived list (with a back button). The
  sidebar list now scrolls (`overflow-y-auto`, bounded height chain). Each
  `ConversationItem` shows the linked **trade tag** (`TRD...TUK`) under the
  username for trade-anchored chats. Archived conversations are read-only
  (composer disabled). New `chat.*` keys across all 5 locales.

---

## Per-trade grace period + Sepolia redeploy — 2026-09-13

**Grace period was always 7 days because `TradePage` hardcoded
`DEFAULT_GRACE_PERIOD_SECONDS` (7d) into `createEscrow` — the offer's grace
field was never persisted and never reached the contract.** The contracts pass
`gracePeriod` through faithfully (`KlerosEscrowFactory.createEscrow` →
`KlerosEsc.initialize`, validated `0 < g ≤ 365d`), so there was no contract bug.

- **`TradePage`**: added a "Grace period (hours)" input (string state, clearable,
  `inputMode="decimal"`), default **1 hour**, validated `1h…365d`, and passed to
  both the gas estimate and the real `createEscrow` call. Removed the hardcoded
  default usage; `DEFAULT_GRACE_PERIOD_SECONDS` is now 1h and unused.
- New locale keys `trade.gracePeriod` / `gracePeriodHint` / `gracePeriodError`
  in all 5 locales.

**New Sepolia deployment** (contracts repo `script/DeploySepolia.s.sol`, `--slow`
because the deployer is an EIP-7702 delegated account):
- FakeUSD `0x8026BDb39c4BF99FEeb840fe4a450a19cbEaa9F2`
- MockKlerosCourt `0x0854a7b25e09856e315Be9CA49A143a144Afa1f0`
- KlerosEscrowFactory `0x8F747eCa387Fae1e6c9f997be7e1abe50d667f1C`
- KlerosEsc implementation `0x5d82fc17BC8CBc662Af64Bf677d0f09d2B945aBE`
- treasury moved to `0x1cE3959a3466F0bBC3792A2fd78c97514A531130` (two-step).

UI `.env` updated (`VITE_KLEROS_ESCROW_FACTORY`, `VITE_KLEROS_ESCROW_TOKEN`).
Note: the fresh fUSD has **no balance** in user wallets — `FakeUSD.mint` is
public, so testers must mint before funding.

---

## Reviews & rating entry point + refunded-trade gating — 2026-09-12

**The rating form was only reachable when the on-chain escrow read back exactly
`KlerosEscState.COMPLETED` (`TradeDetailPage.tsx:675`), so refunded trades were
never rateable and a terminal trade whose chain read failed showed no form.**

- **`TradeDetailPage`**: `showRatingForm` now treats a trade as rateable when the
  DB mirror already reports `status in ('completed','refunded')` **or** the live
  escrow is `COMPLETED` — matching the plan written in `docs/dispute-status.md:69`
  but never implemented. Buyers who win a ruling (`refunded`) can now rate the
  seller.
- **`TradesPage`**: completed/refunded rows show a filled `Star` + "Rate this
  trade" badge linking through to the trade detail (where the form renders).
- New locale keys `trades.rateTrade` in all 5 locales.

---

## Multi-worker audit: Supabase/React, wallet, contracts, UI — 2026-09-12

Four parallel audits (Supabase↔React, wallet/MetaMask, contract usage, UI) produced
a bug list; the highest-signal items were fixed. Highlights:

- **Silent RLS write/read failures**
  - `updateTradeStatus`/`updateDisputeOnChain` wrote columns revoked from
    `authenticated` (20260824000006), so every terminal trade/dispute mirror
    failed with 42501 and was swallowed by `.catch()`. Both now route the
    sensitive columns through SECURITY DEFINER RPCs: `set_trade_status`
    (extended to stamp `completed_at`/`cancelled_at`/`disputed_at`/`has_dispute`)
    and the new `set_dispute_on_chain`.
  - Private-offer visibility and avatar-upload storage policies still read the
    top-level `auth.jwt() ->> 'wallet_address'` claim; wrong path → always
    denied. Migration `20260912000000_*` recreates them against
    `user_metadata.wallet_address`.
  - `listConversations` dropped the unread-count RPC error (supabase-js resolves
    with `{ error }`), silently zeroing every badge.
- **Chat**
  - `useMessages.hasMore` was computed from the merged list length, so the
    "Load older" button never went away; now tracked from each page + an
    in-flight guard. `MessageThread` only autoscrolls when a NEW message
    arrives (not when history is prepended). Duplicate `useConversations`
    subscription removed (sidebar receives the parent's query result).
  - `getMessageSortKey` no longer degrades a missing cursor to epoch.
- **Auth/session**
  - `SignInPrompt` now shows whenever there is no live session (a stale
    remember-me marker previously hid it, leaving users stuck signed-out);
    `ensureWalletSession` callers branch on the returned `session` instead of a
    dead `catch`. `refreshToWalletClaim` honors `exp`; `signOut` only clears the
    active wallet's rejection marker.
  - ChainGuard's switch button no longer stays disabled after a failed switch,
    and falls back to `wallet_addEthereumChain` on MetaMask 4902.
  - Mainnet default RPC moved off the degraded `cloudflare-eth.com`.
  - Trade/notification/dispute reads are session-gated and keyed by the session
    wallet so a cold-load anonymous read can't cache `null`/`[]`.
- **Contracts/UI**
  - Trades: seller funding split into deposit-then-lock vs lock-only (fixes the
    inverted gating and the 0%-deposit stuck escrow); buyer deposit hidden once
    deposited; receipt `status` is checked before mirroring success/reputation;
    `executeRuling` gated on Kleros `Solved`; `canAppeal`/`canTimeout` state
    gates corrected; arbitrate sends a 10% fee buffer; escrow state polls.
  - `TradePage` rejects offers whose token disagrees with the factory's pinned
    escrow token.
  - `FullDropdown` no longer hardcodes "All"; explorer link works; `EditOfferPage`
    no longer spins forever on a bad id; operator report resolution works for
    DB-backed rows; EvidenceThumb/NotificationsBell handle rejections; report
    modal/chrome strings i18n'd; missing locale keys filled across all 5 locales;
    lint is back to 0 errors.

Files: many (see git diff). New: `supabase/migrations/20260912000000_claim_path_fixes_and_status_rpcs.sql`.

---

## Chat owns the viewport + eager prefetch after sign-in — 2026-09-12

Two follow-ups from the session-gating fix: the chat page scrolled the document
instead of the message pane, and page data only loaded on first visit.

- **Fixed-height chat shell** (`AppLayout`, `PageContainer`, `ChatLayout`): the
  chat route now gets a definite `h-[100dvh]` shell with the footer dropped and
  `PageContainer` padding removed, so the document never scrolls. Every pane is
  `min-h-0`; only `ConversationList` / `MessageThread` scroll internally. Normal
  app pages keep the existing `min-h-screen` document flow + footer.
  `PageContainer` gained a `padded` prop; the old `h-[calc(100dvh-4rem)]` /
  `-mb-8` hack is gone.
- **`usePrefetchAppData`** (mounted in `App.tsx`): once a live session exists,
  warms the cache for every main surface — current user, profile, reviews,
  reputation, own offers, active offers, conversations, notifications + unread
  count + prefs, trades, disputes — using the exact page query keys so
  navigation is instant. Runs once per session wallet.
- **Disconnect lands on the marketplace** (`useSyncUser`): the `isConnected`
  true→false transition navigates to `/app/offers` (covers disconnects from our
  menu and RainbowKit's account modal alike). The initial not-yet-reconnected
  mount is ignored.

---

## Chat loads off the live Supabase session, not a world-readable row — 2026-09-12

"Messages don't load even though I'm connected and signed in" was a silent RLS
denial: `useCurrentUser` resolves any *connected* wallet to a `users` row (that
table is `select using (true)`), and the chat hooks gated only on that row — so
with no/mismatched JWT the reads ran unauthenticated, `messages_read_participant`
filtered every row, and PostgREST returned `[]` with no error. "Signed in" in the
top nav was also just the localStorage marker, never the actual token.

- **New `useWalletSession`** (`src/hooks/useWalletSession.ts`): exposes the wallet
  encoded in the live Supabase JWT (`getSessionWallet`) and `hasSession`, polled so
  a cold-load restore race or silently-expired token flips the gate.
- **Chat hooks gated on the session** (`useMessages`, `useConversations`,
  `useConversation`, `useConversationByTradeId`): `enabled` now requires
  `hasSession`, and the session wallet is part of the query key so completing SIWE
  or switching wallets can't reuse an anon/other-wallet cache entry. The same
  treatment landed on the wallet-scoped DB reads in `useTrades` / `useDisputes` /
  `useDispute`, which had the identical silent-empty failure.
- **`AuthSessionSync`** (`src/hooks/useAuthSessionSync.tsx`, mounted in `App.tsx`):
  bridges `supabase.auth.onAuthStateChange` into React Query (deferred past the
  auth lock) so sign-in/out/refresh invalidates `wallet-session` + chat/user keys.
- **`useSignedInStatus`** now derives `isFullySignedIn` from the live session, not
  the marker + users row. `SignInPrompt` hides when a live session exists and
  derives visibility during render; `ChatLayout` shows an explicit "sign in to load
  your conversations" state instead of a misleading "conversation not found".
- **Real refresh token** (`supabase/functions/siwe-auth/index.ts` + client): the
  edge function dropped GoTrue's `refresh_token` and the client stored a
  `'siwe-wallet-session'` placeholder — with `autoRefreshToken: true` that refresh
  fails, GoTrue emits `SIGNED_OUT`, and the session dies silently. Both now carry
  the real token.
- **Navbar "Sign in"** (`WalletConnectButton`) runs SIWE for the already-connected
  wallet (new `force` option on `ensureWalletSession`) instead of opening a connect
  modal that could never complete the session.

---

## RBAC, Audit Logger Movimenti & Operator Dashboard — 2026-09-10

Implemented a complete Role-Based Access Control (RBAC) architecture, an immutable user/operator activity audit logger, user reporting mechanism, and an Operator Portal dashboard:

- **Database & Migrations** (`docs/migrations/002-rbac-audit-logger-operator-dashboard.sql`):
  - `sys_programs` (system modules & controllers: `OPERATOR_PORTAL`, `AUDIT_LOGGER`, `USER_REPORTS`, `MESSAGES_INSPECTOR`, `TRADES_MONITOR`, `DISPUTES_CONSOLE`, `RBAC_MANAGEMENT`).
  - `sys_roles` (`SUPER_ADMIN`, `COMPLIANCE_LEAD`, `SUPPORT_OPERATOR`, `ARBITRATOR`, `AUDITOR_READONLY`).
  - `sys_permissions` (`VIEW`, `CREATE`, `EDIT`, `DELETE`, `EXECUTE`, `VIEW_PRIVATE_MESSAGES`, `RESOLVE_REPORT`, `MANAGE_OPERATORS`, `AUDIT_READ`).
  - `sys_program_role_permissions` (atomic matrix linking Program × Role × Permission).
  - `sys_operators` & `sys_operator_roles` (backoffice staff identity & role assignments).
  - `user_activity_logs` (immutable event log recording actor, program, action, resource, old/new states, metadata, and telemetry).
  - `user_reports` (user reports for scam, fraudulent payment receipts, abusive chat, or off-platform trading).
- **Core Services & Types** (`src/types/rbac.ts`, `src/lib/auditLogger.ts`, `src/lib/operatorService.ts`, `src/lib/reportsService.ts`):
  - In-memory & Supabase logging engine (`logUserActivity`, `listUserActivityLogs`).
  - Permission checker & matrix modifier (`hasPermission`, `isPermissionEnabled`, `toggleRolePermission`).
  - Chat inspection service with automatic audit logging upon transcript access.
  - User reports creation and resolution workflows with operator notes.
- **UI & Operator Portal** (`src/pages/OperatorDashboardPage.tsx`, `src/components/custom/ReportUserModal.tsx`, `src/components/layout/Navbar.tsx`):
  - Operator Dashboard with 4 interactive tabs: User Reports, Movement Audit Logger, Messages Inspector, and Dynamic RBAC Matrix.
  - User reporting modal integrated on Chat Header and Profile page.
  - Navigation route `/app/operator` registered in `App.tsx` and Navbar resources.
- **Testing** (`tests/security/rbac-audit-logger.spec.ts`):
  - Unit & security test suite covering RBAC permissions, audit logger persistence, reports lifecycle, and message inspection permission checks (100% passing).

---


## Session hardening + wallet-claim backfill + live presence — 2026-09-09

"Messages can't be sent", "Conversation not found" on first DM, and "notifications don't
work" all traced to one root cause: RLS resolves the wallet from the session JWT's
`user_metadata.wallet_address`, but (a) the client treated the localStorage marker
`coffernode:siwe:last` as proof of session and (b) GoTrue auth users created **before**
the metadata convention mint JWTs WITHOUT the claim, so `current_user_id()` resolves to
NULL and every wallet-scoped policy silently denies (sends, conversation/notification
reads) — while `isSignedInAs` kept returning true, so the app never re-signed-in.

- **Client** (`src/lib/supabase/index.ts`): `getSessionWallet` now returns the wallet
  ONLY when a live token carries the claim — a token **without** the claim returns null
  so `isSignedInAs` flips false and the next wallet round forces a fresh SIWE sign-in.
  Dropped the marker-based claim fallback (`getSiweMarker` removed; marker is now just a
  remember-me hint). `isSignedInAs` additionally hard-requires `access_token` + non-expired
  `exp`.
- **Claims self-heal at boot** (`src/lib/supabase/index.ts::refreshToWalletClaim`): when a
  stored session token is valid but claim-less (minted pre-backfill), `ensureWalletSession`
  exchanges the refresh token ONCE — GoTrue re-reads the now-backfilled user_metadata when
  minting a fresh token, so the claim-less JWT is silently rewritten into a claim-bearing
  one without re-prompting the wallet. Verified live via a temp `diag` function (deployed,
  exercised, removed): minted a real server-side magiclink token, decoded
  `user_metadata.wallet_address` present, `rpc/current_user_id` → 200
  `3ca94e15-…`, `notification_preferences` read → 200, `conversations` read → 200
  (previously 42501/406 with a stale token).
- **Server** (`supabase/functions/siwe-auth/index.ts`): new `ensureWalletMetadata` runs on
  every verify — `admin.auth.admin.updateUserById` backfills
  `user_metadata.wallet_address` on EXISTING auth users (both the link fast-path and the
  `email_exists` retry), so the very next magiclink token carries the claim and post-deploy
  sign-ins self-heal the broken sessions.
- **Send-failure toasts** (`src/hooks/useMessages.ts`): optimistic send errors now branch
  `42501` → `chat.signInRequired`, `401`/`PGRST301` → `chat.reconnectRequired`, else
  `chat.sendFailed` (new keys in all 5 locales).
- **Live online/offline** (`src/hooks/useGlobalPresence.tsx` + callers): app-wide
  `presence:coffernode:global` channel drives the chat partner dot (`ChatLayout.tsx`) and
  the ProfilePage badge via `onlineUsers.has(id)`; multi-tab-safe (re-baseline on
  sync/join/leave, provider remounts on identity change).
- **Notifications resilience** (`src/hooks/useNotifications.ts`): 30s `refetchInterval`
  fallback so the bell feed isn't permanently stale when Realtime publication doesn't
  deliver.

## TradePage escrow create preflight — bounded gas + real revert surfacing — 2026-09-09

`createEscrow` on TradePage now estimates the contract call BEFORE broadcasting and
submits with a bounded gas limit, so a reverting estimate can no longer degrade into the
misleading Infura rejection ("transaction gas limit too high (cap: 16777216, tx: 21000000)")
that masks the true cause with a wallet-padded ~21M gas fallback.

- **Root cause found on-chain** (Sepolia factory `0x19003a…71`): `createEscrow` rejects
  any party that is the factory's `treasury`/`owner`. In this deployment both are
  `0xcaDF076f…ssda1d` (the deployer), so every offer created from that wallet reverts
  with custom error `0x14bcf5c8` — for BOTH roles, at any amount/bps/grace (verified
  via `eth_estimateGas` probes across all 16 live offers; only that maker's offers fail).
  `0xd7c43e0f` = `InvalidGracePeriod()`, `0xbab7ca35` = `InvalidSeller()` (4byte registry).
- **Fix** (`src/pages/TradePage.tsx`): preflight `estimateContractGas` → on revert, show
  the REAL reason (selector/message) in the toast and abort (no tx sent); on success,
  submit with `gas = estimate * 1.3`, far below the 16.7M RPC cap. Added guards for
  buyer==seller and `cryptoBaseUnits == 0`. New i18n keys in all 5 locales
  (`errorSameCounterparty`, `errorAmountTooSmall`, `errorCreateEscrowEstimate`).
- **Ops note**: the treasury/owner wallet (`0xcaDF…`) can never be a trade party — create
  offers from a different wallet on this deployment.

## SIWE sign-in production cutover — GoTrue-issued sessions — 2026-09-08

First-time wallet connect now lands a real, platform-signed GoTrue session end-to-end on
the deployed project (nonce → SIWE verify → `access_token` → RLS-authorized reads).

- **Why it changed**: the hosted runtime no longer injects a signing secret and the
  injected `SUPABASE_JWKS` is public-only (EC ES256, `hasD: false`); legacy HS256 secrets
  are rejected by GoTrue (`bad_jwt`) and PostgREST (`PGRST301`). A self-minted JWT can
  never pass the platform's signature check.
- **Final architecture** (`supabase/functions/siwe-auth/index.ts`): removed `mintToken`
  (jose/JWT signing); `handleVerify` now provisions the GoTrue auth user then
  `exchangeMagiclinkSession()` issues a server-side magiclink for the wallet email
  (`/auth/v1/admin/generate_link`, admin key on `apikey` + `Authorization`) and exchanges
  `hashed_token` (top-level, not `properties.token_hash`) at `/auth/v1/verify` with the
  injected anon key. GoTrue mints an ES256 token its own RPC layer trusts.
- **RLS claim-path fix** — migration `20260908000001_siwe_go_true_claim_fix.sql`:
  GoTrue JWTs carry `wallet_address` nested under `user_metadata`, so `current_user_id()`
  and `users_insert_self`/`users_update_self` now read the nested path (top-level
  fallback) instead of `auth.jwt() ->> 'wallet_address'` (always NULL → all wallet-scoped
  policies silently denied). `getSessionWallet` in `src/lib/supabase/index.ts` mirrors the
  fallback for client-side display.
- **Verified live** on `tauyciaavhnopeseecmz`: verify returns 200 + GoTrue token,
  `/auth/v1/user` 200, `/rest/v1/users` self-row 200, `/rest/v1/conversations` 200,
  `get_unread_conversation_counts` RPC 200.
- **Ops**: migration drift was reconciled idempotently along the way (
  `20260814000001` `"window"` keyword, `20260824000002/3/6/8` defensive reconciliation,
  `20260829000002` pre-drop policies + `to_regclass` guard); `message_attachments` does not
  exist on the remote (pre-existing gap, unrelated). Temp probe `envprobe` removed (deployed
  + local). `send-email` is deployed but still untested.
- **⚠ SECURITY**: several project credentials were exposed during debugging — rotate the
  PAT (`sbp_…`), service-role (`sb_secret_…`), publishable key, and the shared JWT secret
  value `faa6ba9b-…` at the next session.

---

## Codebase-wide bug audit & lint/build hardening — 2026-09-07

Resolved route mismatches, explorer base URL misconfigurations, form validation/i18n omissions, React hook dependency issues, and ESLint rule configurations. Full test suite, lint, and production build pass with 0 errors.

- **Route alignment**: Fixed `ChatHeader` linking to `/app/trade/:trade_id` instead of `/app/trades/:id` (trade details); updated `NotificationsBell` and `email.ts` to route trade notifications to `/app/trades/${trade_id}` and dispute notifications to `/app/disputes/${dispute_id}`.
- **Explorer links**: Fixed `AddressWithActions`, `ProfilePage`, `SellerHoverCard`, and `OpenOfferPage` using `explorerBase.token` for wallet addresses instead of `explorerBase.address`.
- **CreateOfferPage**: Added missing `fiatCurrency` selector with full currency options (`CURRENCY_SYMBOLS`), bound `currSymbol` dynamically, updated i18n locales, and fixed currency placeholder in hint text.
- **OffersPage**: Added missing token filters (`USDT`, `DAI`, `WBTC`) to align with creation capabilities and centralized currency formatting via `@/lib/utils`.
- **Hook dependencies**: Corrected missing/stale closures and dependencies in `NotificationDispatcherHost`, `ChatLayout`, `useConversations`, `useNotifications`, and `TradeDetailPage`.
- **Profile hydration**: Added wallet-address-change awareness in `EditProfilePage` to re-hydrate form state when switching accounts.
- **Build & Lint**: Resolved all TypeScript build errors (TS6133) and fast-refresh ESLint warnings.

---

## Web3/messaging audit fixes: races, N+1, cursor + id hardening — 2026-09-04

Batch of fixes from the cross-audit, shipped together (typecheck + lint clean).

- **Escrow creation race** (`TradePage.tsx`) — the `EscrowCreated` decode fallback
  no longer guesses via `escrowCountByBuyer - 1n`; it now matches the emitted
  log's `buyer` + `seller` topics against the trade's counterparties, and only
  falls back to the factory clone-scan when no log matches.
- **IPFS teardown race** (`src/lib/ipfs.ts`) — `uploadToIpfs` tracks an in-flight
  counter wrapped in try/finally; `teardownIpfs` waits up to 30s for uploads to
  drain before `helia.stop()`, prevents concurrent double-stop.
- **Unread-count N+1** (`src/lib/supabase/index.ts`) — `listConversations` no
  longer fires one `count` query per thread; a new `security definer` RPC
  `get_unread_conversation_counts(p_user_id)` returns every thread's unread in a
  single round-trip, hard-gated to `current_user_id()`. Migration:
  `20260904000000_get_unread_conversation_counts.sql`.
- **Composite cursors** (`src/lib/supabase/index.ts`) — `listMessages` "before"
  filter and the unread-count cursor were written as `and(a,b),a`, which collapses
  to `a` (the `id` tiebreaker was dead). Now `and(created_at.[lt|gt].ts),
  and(created_at.eq.ts,id.[lt|gt].id)`.
- **Direct-conversation scan-all** (`getOrCreateDirectConversation`) — replaced
  the full-table scan of `trade_id IS NULL` conversations with a
  `conversation_participants` intersection (current user's threads → shared with
  counterparty).
- **State sync** — `updateDisputeOnChain` now honors explicit `resolvedAt: null`
  (`!== undefined` instead of truthy check).
- **Crypto-safe ids** — `generateOfferId`/`generateTradeId`/`generateDisputeId`
  use `crypto.getRandomValues` (base36 suffix) instead of `Math.random()`.
  _(closes `todo.md` "crypto.randomUUID()" item)_
- **`useUserEscrows` multicall** (`src/hooks/useDisputes.ts`) — the two count reads
  and every `escrowByBuyer`/`escrowBySeller` index read now go through viem
  `multicall` (2 round-trips total) instead of one RPC per escrow.
- **Dispute evidence uploads** (`DisputePage.tsx`) — IPFS uploads run through a
  concurrency-3 worker pool instead of sequential awaits; per-file failures still
  collected independently.
- **TradeDetailPage hardening** (same batch, `src/pages/TradeDetailPage.tsx`) —
  #1: `fundEscrow` waits for the `approve` tx receipt before depositing;
  #6: the escrow-watcher callback depends on the `tradeId` primitive, not the
  refetching `trade` object; #9: the second `nowSecsBig` timer was removed and
  `showCancel` reuses the single live ticker.

---

## Standardize SIWE authentication & eliminate client fallback — 2026-09-04

Removed the development-only `legacyClientSignIn` fallback from `signInWithWallet`, making server-side cryptographic signature verification and JWT issuance via the `siwe-auth` Edge Function the mandatory, unified authentication standard across all environments.
Files: `src/lib/supabase/index.ts`.

---

## Fix chat sidebar conversation selection bug — 2026-09-04

Fixed an issue where clicking on conversations in the chat sidebar while visiting a direct chat URL (`/app/messages/:conversationId`) did not switch active chats due to `routeId` precedence and missing navigation logic. `ChatLayout` now correctly navigates on conversation selection, prioritizes user selection (`pinnedId`), and resets pinned state on route navigation.
Files: `src/components/custom/chat/ChatLayout.tsx`.

---

## Fix "Maximum update depth exceeded" — infinite re-render sources — 2026-08-31

Hardened six `useEffect` dependency arrays that re-ran effects on every render
or created unstable references, eliminating chat/notification/esrow re-connect
loops and redundant writes. Changes:
- `src/components/custom/chat/ChatLayout.tsx` — `identity` object now memoized (`useMemo`) so `useTypingIndicator`/`useConversationPresence` stop tearing down/re-subscribing Supabase channels each render; added `lastMarkedRef` to de-dupe `markRead` calls across refetch.
- `src/pages/TradeDetailPage.tsx` — `useEscrowEventWatcher` callback wrapped in `useCallback` so the contract-event watcher isn't re-subscribed on every render.
- `src/components/custom/NotificationDispatcherHost.tsx` — reads latest `prefs.data` via ref instead of putting the array in the effect dep array (`user?.id` dep only).
- `src/components/custom/NotificationsBell.tsx` — refetch effect depends on stable `useUnreadCount().refetch` instead of the whole query object.
- `src/hooks/useConversations.ts` / `useNotifications.ts` — realtime effect deps narrowed to `user?.id`.

---

Replaced the raw text `★` character + `—` fallback in the OpenOffer and Trade
pages with the lucide `Star` icon (filled, primary) + the decimal rating, and a
localized "No ratings yet" label when `avg_rating` is absent/zero (was a bare
`—`). i18n keys `openOffer.noRating` + `trade.noRating` added in all 5 locales.
Files: `src/pages/OpenOfferPage.tsx`, `src/pages/TradePage.tsx`,
`src/locales/*.json`.

---

## Private offers: notify the candidate target on first connect — 2026-08-30

Closed the gap where a *candidate* target (wallet never connected → no
`users` row) got a private offer but no notification and no surfaced
visibility: the DB trigger `notify_private_offer_target` can only notify a
registered `users.id`, so it skipped. Now `ensureWalletSession` calls new
`backfillPendingPrivateOffers(userId, wallet)` — after sign-in it reads any
active private offers pinned to the wallet (RLS-scoped, no cross-wallet leak)
and inserts a `trade_update` notification for those with no existing
`payload.offer_id`, so the offer is visible *only* to the target and they get
the bell/email notification the moment they connect. Idempotent (skips offers
already notified by the trigger or on repeated connects). Files:
`src/lib/supabase/index.ts`.

---

## Private offers (target-only) implemented — 2026-08-30

Offers now support `is_private` + `target_user` (wallet address, DB-enforced
consistency CHECK). RLS restricts reads of private rows to the seller and the
target only (`offers_select_public` = `is_private = false`,
`offers_select_private_parties`); an AFTER INSERT security-definer trigger
`notify_private_offer_target` drops a `trade_update` notification to the
target. UI: CreateOffer sends the fields + validates the address,
Offers/Profile/OpenOffer show a "Private" badge, and the bell routes
`payload.offer_id` to `/app/offer/:id`. Migration
`supabase/migrations/20260830000001_offers_private_target.sql`.

---

## Offer unit mapping fixed on Create Offer (buy/sell) — 2026-08-30

`CreateOfferPage` was storing `crypto_amount = maxAmount` (fiat value) and
`fiat_amount = maxAmount * price` — nonsense units. Now min/max stay fiat and
the crypto quantity is derived (`crypto_amount = maxAmount / price`,
`fiat_amount = maxAmount`), matching the trade flow. Added a per-asset standard
decimals map (BTC 8, ETH/DAI 18, stablecoins 6) to round derived quantities, a
live "≈ X BTC" preview under max amount, and a fiat-units hint. i18n keys
`createOffer.amountInFiat` + `createOffer.cryptoEstimate` added in all 5
locales. `src/pages/CreateOfferPage.tsx`, `src/locales/*.json`.

---

## Production build fix + live test runbook — 2026-08-30

`npm run build` was failing (`tsc -b`): wagmi's `signMessage` is sync/void;
`useSyncUser.ts` now uses `signMessageAsync` (Promise<`0x…`>) for the SIWE
session. Build ✅ 25.3s. Added `docs/live-test-checklist.md` (automated gates
P + manual 2-browser pass covering auth, RLS cross-user isolation, chat,
trade, dispute, retention).

## SIWE + RLS cutover deployed live — 2026-08-30

`siwe-auth` edge function deployed (`--no-verify-jwt`) and all migrations
pushed (`20260829000002` RLS rewrite, `20260830000000` retention). Live app now
signs in via SIWE → server-verified → Supabase JWT with `wallet_address` claim;
every policy authorizes through `public.current_user_id()`, default-deny
catch-all active. Wallet connect verified working end-to-end on the deployed
build.

## Message retention (40 days) + scrollbar cleanup — 2026-08-30

Nightly pg_cron purge of `messages` older than 40 days, FK-safe
(`notifications` cascade off purged rows, dangling
`conversation_participants.last_read_message_id` reset first, sidebar preview
re-derived so it never shows a deleted message) + `idx_messages_created_at` for
the scan. UI: `no-scrollbar` utility in `src/index.css` applied to the chat
thread + sidebar (scroll still works via wheel/touch). Migration
`supabase/migrations/20260830000000_retain_messages_40_days.sql` — lands with
`supabase db push` at the cutover deploy.

## Deterministic message ordering + composite pagination cursor — 2026-08-30

Messages are now ordered by `created_at` then `id` (ascending) everywhere, and
all "older than / newer than" cursors (`listMessages` pagination, per-
conversation unread counts) use a composite `(created_at, id)` predicate
instead of a bare timestamp. `timestamptz` has millisecond resolution, so two
messages landing in the same ms used to make history-loading drop the sibling
(bare `lt`) and make unread badges undercount (bare `gt`). Realtime INSERTs
are now merged into the cache in `(created_at, id)` order rather than arrival
order, and `loadOlder` dedupes against the existing cache. Touched:
`src/lib/supabase/index.ts` (`getMessageSortKey`, `listMessages`,
`listConversations`), `src/hooks/useMessages.ts`.

A code-verified (not live-probed) deep-check pass over who may call what across
the three system surfaces. Run with `npm run test -- tests/security`; the doc in
`docs/penetration-test-matrix.md` is the human-readable rendering and lists the
residual gaps (§6).

- `tests/security/escrow-matrix.ts` **(new)** — canonical allow/deny matrix for
  KlerosEsc (39 fns: 13 mutating + 26 views), KlerosEscrowFactory (createEscrow +
  views + 4 two-step admin setters), KlerosCourt (5 views), each entry tagged
  with an evidence source (`contract-doc` / `abi` / `client-gate` / `unverified`).
- `tests/security/escrow-access-control.spec.ts` **(new)** — ABI surface must
  equal the matrix (mutating + view sets), floating-point-free constants
  (`NUMBER_OF_CHOICES=4n`, rulings 0-4, grace 7d/365d, 1d cancel timelock, 30d
  dispute timeout, deposits 1/10/15%), and client action gates must not expose a
  caller the matrix denies.
- `tests/security/rls-model.ts` **(new)** — replay engine over
  `supabase/migrations/*.sql`: paren/`$$`-aware statement splitter (strips `--`
  comments), policy create/drop parser, dynamic `do $$` RLS loops, SECURITY
  DEFINER + `search_path` tracking.
- `tests/security/rls-policy.spec.ts` **(new)** — asserts the final posture
  (anon read on marketplace/profile, zero anon writes, claim-scoped writes,
  party-scoped trades/disputes/chat, own-messages delete, sender-bound inserts,
  siwe tables policy-free, avatars owner-path, ±10 delta bound), plus a
  pre-cutover reality check that **proves** anon write access still exists on
  the un-deployed baseline.
- `tests/security/{siwe-auth,send-email}.spec.ts` **(new)** — deny/allow tables
  exercising the shared pure modules.
- `supabase/functions/_shared/siwe-core.ts`, `email-core.ts` **(new)** — pure
  authorization logic extracted from the edge functions so the suite can import
  it (no `Deno.*`); `rateLimited()` gained an injectable clock for window tests.
- `supabase/functions/siwe-auth/index.ts`, `send-email/index.ts` — refactored to
  import the shared modules (no behaviour change).
- `vitest.config.ts` **(new)** — vitest 4 runner (installed with
  `--legacy-peer-deps` due to the pre-existing `typescript ~6` /
  `@web3icons/core` peer conflict).

---

## Security P1 — SIWE sessions + wallet RLS rewrite — 2026-08-29

Wallet-authenticated identity + the RLS cutover it unlocks (see
`docs/security-audit.md` §1/§2). Anon loses all write access; every table gets
owner/party/self-scoped authorization.

- `supabase/functions/siwe-auth/index.ts` **(new)** — server-side SIWE:
  one-shot `siwe_nonces` (5 min TTL, address-bound), EIP-4361 parse +
  viem `verifyMessage`, GoTrue auth-user provisioning linked via
  `siwe_auth_links`, HS256 JWT via `jose` (`role: authenticated`, custom
  `wallet_address` claim, 24h TTL), CORS host allowlist.
- `supabase/migrations/20260829000002_siwe_auth_rls.sql` **(new)** — rewrites
  the permissive policies on users/offers/trades/trade_events/
  conversations/conversation_participants/messages/message_attachments/
  notifications/notification_preferences/disputes/dispute_evidence/
  trade_ratings + reputation tables; avatars storage owner-bound by path;
  RLS-scoped `current_user_id()` helper (JWT `wallet_address` → `users.id`);
  `search_path` pinned on the three chat SECURITY DEFINER triggers.
- `src/lib/supabase/index.ts` — `signInWithWallet` now signs via
  `siwe-auth` and installs a real session (`setSession`); `ensureUser` is
  read-mostly (returns `null` pre-session); new `getSessionWallet` /
  `isSignedInAs` / `ensureWalletSession`; SIWE signature no longer persisted
  to localStorage; localhost falls back to client-verify until the edge fn
  ships.
- `src/hooks/useSyncUser.ts` — signs in on wallet connect, tears the session
  down on disconnect.
- Pages: `null`-safe `ensureUser` guards (TradePage/CreateOfferPage/DisputePage).

> ⚠ **Deploy pending (coordinated):** deploy `siwe-auth` → `supabase db push`
> → ship client; test sign-in + one full trade flow on staging first.

---

## Security P0 hardening — 2026-08-29

First wave of the full-stack security audit (`docs/security-audit.md`). Closes
the most exploitable off-chain paths without waiting for the SIWE/JWT rewrite.

- `supabase/functions/send-email/index.ts` — recipient is now **resolved
  server-side** from `notification_preferences` (never client-supplied `to`),
  `html` refused (text-only relay), per-recipient rate limit (2/60s), CRLF
  stripping + length caps, CORS locked to `coffernode.app` + localhost, Supabase
  client headers required. This was an open spam/phishing relay.
- `src/lib/notifications/channels/email.ts` — sends `{ user_id, subject, text }`
  only; no addresses leave the client; dry-run log no longer prints addresses.
- `supabase/migrations/20260829000001_security_p0_hardening.sql` —
  `increment_reputation_score` was an anon-callable SECURITY DEFINER sink
  (arbitrary user_id/delta). Deltas now hard-bounded to ±10, NULL user_id
  rejected. Legit UI deltas (±2) unchanged.
- `docs/security-audit.md` — full audit of every flow (auth, offers,
  trades/escrow, disputes/ratings, chat/real-time, notifications/email,
  profile/storage) with severity-ranked findings and a P1/P2 roadmap.

**Verification**: `npm run typecheck` clean. P0 items are deliberately
behavior-preserving until SIWE/JWT lands; Resend key rotation + P1 items
tracked in `docs/todo.md`.

## Avatar uploads move from IPFS → Supabase Storage — 2026-08-29

Fixed: avatars uploaded in `EditProfilePage` saved fine but never rendered on
`/profile`, because the browser Helia node doesn't pin the CID, so the public
`ipfs.io` gateway returned 404 for the saved URL.

- `supabase/migrations/20260829000000_avatars_storage_bucket.sql` — new public
  `avatars` Storage bucket + permissive RLS (mirrors the pre-SIWE `users`
  policy model; lockdown later with wallet-signed JWT).
- `src/lib/supabase/index.ts` — `uploadAvatar(file, walletAddress)` uploads to
  the `avatars` bucket and returns a public object URL.
- `src/pages/EditProfilePage.tsx` — `handleAvatarFile` now calls `uploadAvatar`
  instead of `uploadToIpfs`. The in-app object-URL preview and the
  `users.avatar_url` persist path are unchanged, so `/profile` now resolves the
  Storage URL and shows the image. Dispute evidence still uses `uploadToIpfs`.
- `.env.example` — no new keys required (no external pinning service).

**Verification**: `npm run typecheck` clean, ESLint clean on touched files.
Requires `supabase db push` to create the bucket before first upload.

## Profile avatar upload + UX/parity fixes — 2026-08-28

Closed the P0 avatar gap and the P1 surface issues found in the end-to-end
flow audit (offers → trade → escrow → dispute → profile).

**Avatar upload (P0)** — `EditProfilePage.tsx`
- The hover "pencil" overlay now acts as a real upload trigger: clicking the
  avatar (or tabbing + Enter) opens a hidden `<input type="file" accept="image/*">`.
- Validates MIME type + ≤5MB, uploads via `uploadToIpfs` (the same Helia path
  used by the dispute flow), shows a live preview via `URL.createObjectURL`
  with a spinner, and persists the gateway URL into `users.avatar_url` (the
  `updateUserProfile` data layer already handled `avatarUrl`).
- Added a "Remove picture" action and an object-URL cleanup effect.
- New i18n keys `editProfile.avatar*` / `removeAvatar` in all 5 locales.

**Dispute evidence gallery (P1)** — `DisputeDetailPage.tsx`
- The image gallery previously read `parsed.evidence` from the `description`
  blob, which the create-flow never populates — so images never rendered.
- The `dispute_evidence` section now renders an actual `<img>` gallery built
  from each row's `ipfs_url` (`ipfs_cid` gateway fallback), keeping round,
  submitter, timestamp and Etherscan tx deep-link metadata.

**Missing i18n keys (P1)** — all 5 locales (`en/es/fr/tr/zh`)
- Added 11 previously-missing keys that were rendering as raw strings:
  `disputeDetail.{submitEvidence,submitMoreEvidence,submittingEvidence,evidenceRound,evidenceSubmittedSuccess,evidenceSubmittedError}`, `profile.loading`, `tradeDetail.{releaseAvailableIn,tradeRemovedOrNoAccess}`, `trades.{escrowFunded,escrowCancelled}`.
- Verified programmatically: no key drift across locales; `releaseAvailableIn`
  interpolation uses `{{seconds}}` to match `TradeDetailPage.tsx:860`.

**Dead "Edit offer" button (P1)** — `ProfilePage.tsx`
- Removed the offer-row Edit button that navigated to a non-existent
  `/app/offer/:id/edit` route, plus the now-empty Action column header and the
  `colSpan` 6→5 empty-state cells.

**Verification**: `npm run typecheck` clean, `npm run build` clean (only
pre-existing `INVALID_ANNOTATION`/chunk-size warnings from `node_modules`),
ESLint clean on all touched files.

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