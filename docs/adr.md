# ADR — Registro decisioni architetturali

> Decision log for the architecture of `p2pAPP`. Each ADR records _what_ was
> chosen, _why_, and its consequences. Open decisions (`OD-*`) are tracked as
> proposals with a target phase; status legend:
>
> **Accepted** = implemented and verified · **Proposed** = agreed direction, not yet built · **Deferred** = parked, revisit later

---

## Table

| ID      | Decision                                                                                                                           | Status                                                                                              | Date       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| ADR-001 | Route-level code splitting via `React.lazy` + layout-owned Suspense                                                                | Accepted                                                                                            | 2026-09-13 |
| ADR-002 | Lazy i18n: only `en` bundled, other locales via `import.meta.glob`                                                                 | Accepted                                                                                            | 2026-09-13 |
| ADR-003 | Vendor chunk buckets via `manualChunks` + build budget                                                                             | Accepted                                                                                            | 2026-09-13 |
| ADR-004 | Shared skeleton fallback (`AppPageFallback`, `aria-busy`)                                                                          | Accepted                                                                                            | 2026-09-13 |
| ADR-005 | Offer is consumed at trade creation (one-shot marketplace rule)                                                                    | Accepted                                                                                            | 2026-09-13 |
| ADR-006 | Route/chunk/i18n verification baseline: Playwright (Chromium)                                                                      | Accepted                                                                                            | 2026-09-13 |
| ADR-007 | Edge document layer + client-side edge-data hydration                                                                              | Accepted (live deploy verified)                                                                     | 2026-09-13 |
| ADR-008 | Restricted public reader: `anon` column-level projection (DB + worker + client)                                                    | Accepted                                                                                            | 2026-09-13 |
| ADR-009 | Referral program ("Invite & Earn"): server-credited share of platform fees                                                         | Accepted                                                                                            | 2026-09-15 |
| ADR-010 | Wallet connect is sign-in-free: SIWE is explicit opt-in, never auto-triggered on connect                                           | Accepted                                                                                            | 2026-09-15 |
| ADR-011 | Chain gate is scoped to contract-write pages; browsing/connect is chain-agnostic                                                   | Accepted                                                                                            | 2026-09-14 |
| OD-01   | Defer the wallet stack off the critical path                                                                                       | Proposed (Fase 3)                                                                                   | 2026-09-13 |
| OD-02   | Restricted reader role + minimal public projection                                                                                 | Accepted (Fase 1: DB column projection; anon-key removal deferred to BFF)                           | 2026-09-13 |
| OD-03   | Per-route edge behaviour via `functions/_middleware.ts` + `_routes.json` (public → inject data + `s-maxage`; private → `no-store`) | Implemented in repo (deploy pending) — see ADR-007                                                  | 2026-09-13 |
| OD-04   | Edge-cache invalidation via Supabase write webhooks (`/api/cache-purge`)                                                           | Implemented in repo (webhook config pending)                                                        | 2026-09-13 |
| OD-05   | Security headers (`_headers` CSP/HSTS) + drop anon key from the bundle                                                             | Partially implemented (headers live); anon-key removal deferred to BFF phase (keep OD-02 carve-out) | 2026-09-13 |
| ADR-012 | Cookie-derived per-route cache keys at the edge (`coffernode_session` mirror + `x-cache-key` + `Vary: Cookie`)                     | Accepted                                                                                            | 2026-09-20 |
| ADR-013 | Self-hosted client error reporting (`error_logs` + `/api/error-report` + React boundary)                                           | Accepted                                                                                            | 2026-09-20 |
| ADR-014 | Device-bound Coffer Identity: client-derived HKDF master → per-label pseudonyms                                                    | Accepted                                                                                            | 2026-09-20 |

---

## ADR-001 — Route-level code splitting

**Context.** Every page was statically imported in `src/App.tsx`; the entry
chunk was ~1.9 MB and every visitor downloaded all of Trading/Disputes/Docs on
first paint.

**Decision.** Wrap every page in `React.lazy()`. Layouts (`AppLayout`,
`DocsLayout`) stay eager and own a `<Suspense>` boundary so navigation
re-renders only the page slot, keeping the navbar/footer mounted.

**Consequences.**

- Entry chunk: **~1.9 MB → ~110 KB**; each route is a cacheable chunk loaded on first visit.
- `AppLayout`/`DocsLayout` imported eagerly by design (they are the Suspense shell).
- No new dependency; async boundaries are implicit — page components are already self-contained.

## ADR-002 — Lazy i18n

**Context.** All 5 locales were `import`ed statically in `src/i18n.ts`, adding
~170 KB of JSON to the first payload.

**Decision.** Bundle only `en` (the fallback, so `t()` never suspends). Other
locales become Vite chunks via `import.meta.glob('./locales/*.json')`, fetched
on first switch; `ensureLoaded` guards against re-entrant loads.

**Consequences.** ~90% of translation weight off the first payload.
Non-`en` users render `en` for a few frames on a cold boot until their locale
chunk resolves (acceptable; recorded for Fase 2 prerender work).

## ADR-003 — Vendor chunk buckets

**Context.** Rolldown's default heuristics put every third-party lib in one
megafile; a single dependency bump invalidated the whole vendor cache.

**Decision.** Explicit `manualChunks`: `web3`, `charts`, `ipfs`, `ui`,
`backend`, `data`, `fx`, `react`, `vendor`; `chunkSizeWarningLimit: 500`;
`reportCompressedSize` on. Leaf libs (viem/recharts/supabase/helia) stay out
of the shared vendor bucket so unused routes don't download them.

**Consequences.** Stable, independently-cacheable buckets; leaf bundles already
route-scoped. The `web3` bucket (~3 MB) is still on the initial load because
the app shell imports the wallet stack — see OD-01.

## ADR-004 — Shared skeleton fallback

**Context.** Per-page `Loader2` spinners, no coordination, whole-tree flashes
on chunk load.

**Decision.** One `AppPageFallback` component (design tokens, `animate-pulse`,
`aria-busy`, `role=status`) rendered inside each layout's Suspense. No custom
spinner allowed for route-chunk loads.

**Consequences.** Consistent loading UX; SRs get a pending announcement;
the shell never disappears.

## ADR-005 — Offer lifecycle: consumed at trade creation

**Context.** Offers stayed `active` forever in the marketplace.

**Decision.** One-shot offers: opening a trade against an offer atomically
marks it `completed` (SECURITY DEFINER trigger `trg_archive_offer_on_trade_created`,
migration `20260915000004_archive_offer_on_trade_created.sql`), so it leaves
`getActiveOffers` and survives only in the seller's offers table with a badge.

**Consequences.** No client race, works for every write path. Decisions not
yet made: retroactive backfill of already-consumed offers; hard UNIQUE on
`trades.offer_id` (double-accept protection); re-activating an offer after a
cancelled trade.

## ADR-006 — Browser verification baseline

**Context.** Route/chunk/i18n behaviour can't be proven by `tsc`/lint/build.

**Decision.** Playwright (Chromium, already a devDependency) as the standard
check: load `/`, `/app/offers`, `/app/trades`, `/docs`, switch language, assert
on-demand chunks and that no `[aria-busy]` boundary is left stuck.

**Consequences.** Re-runnable smoke script (currently ad-hoc in temp dir —
worth promoting to `tests/e2e/` when CI lands, see todo).

## ADR-007 — Edge document layer + edge-data hydration

**Context.** The deployable site is a pure SPA: every navigation downloads the
full shell and refetches public data client-side, so deep links flash and
public routes are uncachable HTML.

**Decision.**

- `functions/_middleware.ts` (Pages Functions, `_routes.json` `/*` minus
  `/assets/`) serves every _document_ navigation. PUBLIC routes (landing, docs,
  offers, offer detail, public profile) get the built shell with a public-data
  projection injected as `<script id="__EDGE_DATA__" type="application/json">`
  and edge-cacheable `Cache-Control: public, s-maxage=300, SWR`. PRIVATE routes
  (trades, messages, disputes, operator, edit) → `Cache-Control: no-store`, no
  data ever leaves the edge; the shell gates client-side on the session.
- Client (`src/lib/edgeData.ts`) reads the blob pre-render and seeds
  react-query (`['offers']`, `['offer',id]`, `['user-profile',addr]`), which
  wins over the localStorage snapshot (`hydrateQueryCache` `skipExisting`).
- `functions/api/cache-purge.ts` invalidates the mapped URLs on Supabase write
  webhooks, guarded by `PURGE_SECRET`.

**Consequences.**

- Deep links to public pages paint instantly with server-fresh data; verified
  by `npm run test:e2e` (`tests/e2e/edge-hydration.cjs`): seeded offer renders,
  zero Supabase fetch on first paint, and live on https://coffernode.pages.dev
  the same checks pass against the deployed middleware (`x-edge-route`,
  `s-maxage`/SWR on public, `no-store` on private, `PURGE_SECRET` gate).
- Live deploy note: project `coffernode` (Pages), `--branch main` pushes
  production; the preview branch `master` lacks the `SUPABASE_READ_KEY` /
  `PURGE_SECRET` secrets (see `docs/cloudflare-deploy.md`). Local workerd can't
  run on this mac (OS ≤ 13.4) — all edge validation happened live after deploy.
- Not yet done: prerendered SEO HTML per route (this injects data into the SPA
  shell — full SSR/SEO is a follow-up) and Fase 3 wallet deferral.

---

## ADR-008 — Restricted public reader: `anon` column-level projection

**Context (OD-02).** Every reader (the SPA bundle and the edge worker) talks to
Supabase REST with the same `anon` key. `select=*` returns internal columns
(`users.role`, social handles, `last_active_at`, `offers.views/clicks`,
`premium_multiplier`, `featured`, `updated_at`) to any anonymous visitor.

**Decision.**

- Do NOT create a new Postgres role nor swap `pgrst.db_anon_role` — the anon
  key is required by GoTrue auth in the browser bundle (carve-out, see OD-05 /
  BFF follow-up). Restrict what `anon` sees at the **column** level.
- Migration `20260915000002_od02_public_reader_projection.sql`:
  1. `revoke select on public.users/offers from anon` (removes the
     table-level grant; a plain column-REVOKE is a no-op when the role also
     holds the table grant — PostgreSQL unions table + column privileges), then
  2. `grant select (<projection>) … to anon` **dynamically** against
     `information_schema.columns`, so a drifted/missing live column (e.g. the
     denormalized-stat columns not yet shipped) can't 42703 the migration.
- Projection (both tables) is mirrored verbatim in
  `functions/_lib/public-data.ts` (edge) and `src/lib/supabase/index.ts`
  (`PUBLIC_OFFER_COLUMNS`, `PUBLIC_USER_COLUMNS`, `SELLER_JOIN`) — the edge
  worker and the client can only ever request granted columns.
- Owner reads stay full: `userColumnsForRead(wallet)` returns `'*'` only when
  the signed-in session wallet matches the requested row (EditProfilePage
  writes social/meta fields, so its reads must include them). Everything else
  (anon or not-self) uses the public projection.
- `authenticated` (SIWE sessions) and `service_role` are untouched: full
  table-level rights preserved.

**Consequences.**

- Anonymous `select=*`/excluded columns → PostgREST `42501 permission denied`.
  Verified live: `users.role`, `users.website`, `users.last_active_at`,
  `offers.views`, `offers.updated_at` all rejected; projection select and the
  marketplace `seller:users` join return 200; the deployed edge pages still
  hydrate (`profile:null` regression caught and fixed by dropping the
  non-existent denormalized-stat columns from the projection).
- Scraping surface drops to exactly the rendered public UI; `select=*` heavy
  joins fail fast instead of returning everything.
- If a future migration re-`grant select` table-level to `anon` (e.g. adding a
  column to the public projection), OD-02's cut is lost for that table until
  the grant list is re-applied — keep the projection lists in the three files
  in sync and re-run the audit query in the migration header.
- History repair (pre-existing duplicate `20260913000001`): two local
  migrations shared one version name, masking one from `db push`. Renamed to
  idempotent `20260915000003_fix_trade_ratings_insert_policy.sql` and
  `20260915000004_archive_offer_on_trade_created.sql` and re-applied via
  `migration repair --status reverted 20260913000001` + `db push --include-all`.

---

## ADR-009 — Referral program ("Invite & Earn")

**Context.** CofferNode has no acquisition loop: users join organically and the
platform fees on every trade are fully retained. To grow via existing traders,
a referral program must reward a referrer with a share of the platform fee on
trades by referred users — without capturing PII (GDPR), without incentive
structures that look like inducement-to-trade (MiCA/ESMA posture), and without
any client-side trust in the earnings ledger.

**Decision.**

- **Attribution** is opaque-code, first-touch, zero-PII: each user gets one
  8-hex code (`referral_codes`, minted by `get_or_create_referral_code`). A
  visitor reaching `/r/<CODE>` stashes the code in localStorage
  (`coffernode:referral:pending`); the first _authenticated_ session of a NEW
  wallet claims it via `claim_referral` (`referral_relations`, UNIQUE on
  `referred_user_id`). Self-referral, bad codes and double claims are rejected
  in SQL.
- **Credit** is server-only and idempotent: a SECURITY DEFINER trigger on
  `trades.escrow_status → released` calls `credit_referral_fee`, which writes
  one row to `referral_fee_events` (UNIQUE `trade_id`, `on conflict do
nothing`). The referrer earns `REFERRER_SHARE_BPS = 1500` (15%) of the
  platform fee `fiat_amount × platform_fee_bps / 10000`. `credit_referral_fee`
  is **not** granted to client roles — the release path is the only way in.
- **Maths is mirrored**: `calculate_fee_split` (SQL) and `src/lib/referral.ts`
  (TS) implement the same formula; the client previews earnings without a DB
  round-trip, the DB credits what the client sees.
- **RLS** on the three new tables is fail-closed and owner-scoped: SELECT for
  `authenticated` only via `current_user_id()`; zero client INSERT/UPDATE/
  DELETE policies (writes are RPC/trigger only); `anon` sees nothing.
- **Surface**: `InviteEarnCard` on the own profile (link + copy, share badge,
  pending/total ledger, referred friends), `ReferralLandingPage` at `/r/:code`,
  automatic claim wired into `useSyncUser`.

**Consequences.**

- No PII collected, no emails, no contact scraping — defensible under GDPR;
  the reward is a passive % of fees on completed escrow releases, not a
  deposit-volume or FOMO bonus.
- Earnings are in-app credits (status `pending`/`paid`); an on-chain payout
  path is deliberately deferred (od-06 follow-up).
- Client can mislead about its OWN earnings only by UI text; the ledger is
  server-authoritative and auditable against `trade_events`/`trades`.
- `referral_relations` attribution is permanent once claimed (no expiry in v1);
  a "referred-but-inactive" cleanup window is a future refinement.

## Open decisions

### OD-01 — Defer the wallet stack (Fase 3)

wagmi/rainbowkit/walletconnect ≈ 3 MB ride the initial load because the shell
imports them for sign-in. **Direction:** lazy-mount the Connect button and the
wallet providers on first interaction; landing/docs/offers then ship without
`web3`. Proved convex to ADR-001/003; verify against RLS/anon gates.

### OD-06 — Referral payout & program refinement (Proposed)

In-app credit is `pending`/`paid`; there is no withdraw flow yet. **Direction:**
`paid` events become claimable (off-chain ledger → future on-chain transfer or
platform-token credit), add programme toggles (share %, attribution window,
banner on the referred flow), and surface errors + a "how it works" FAQ entry.

### OD-02 — Edge data layer, "public projection" (Fase 1 — DONE)

Public reads (offers, profiles, ratings) used to go straight to Supabase REST
with the bundled anon key — open to scraping and heavy joins. **Status
(2026-09-13):** the restricted reader is shipped and verified as ADR-008: the
`anon` role can SELECT only the public projection columns on `offers`/`users`
(drop-and-regrant, migration `20260915000002`); edge reader
(`functions/_lib/public-data.ts`) and client queries (`src/lib/supabase`)
select exactly that projection. **Carve-out:** the anon key still ships in the
bundle because GoTrue auth requires it — full removal moves to the BFF phase
(OD-05). Read-path "mine vs public" differentiation is handled in
`getUserByWallet`/`ensureUser` (`userColumnsForRead`: owner → `'*'`, else
projection).

### OD-03 — Per-route edge behaviour (Fase 2 — implemented, deploy pending)

Pure SPA: no per-route HTML, no SEO, every route boots the whole shell.
**Status update (2026-09-13):** core implemented — see ADR-007. What remains:
Cloudflare Pages project creation + `wrangler pages secret put` + first deploy;
then per-route cache verification against the live project (`x-edge-route`
header, `s-maxage` on public, `no-store` on private) and, as a follow-up, full
per-route SSR HTML for SEO.

### OD-04 — Edge-cache invalidation (Fase 2 — implemented, config pending)

**Direction:** Supabase write webhooks purge edge cache on offer/trade writes
instead of fixed/swr-only freshness.
**Status update (2026-09-13):** `functions/api/cache-purge.ts` implemented
(offers → `/app/offers` + `/app/offer/<id>`; users → `/app/profile/<addr>`;
guarded by `PURGE_SECRET` header). Remaining: configure the Supabase database
webhooks to `POST /api/cache-purge` with the secret.

### OD-05 — Security headers + secret hygiene (Fase 1)

**Direction:** `_headers` with CSP, HSTS, frame-ancestors, referrer-policy,
COOP/COEP; move `anon`/service keys to real secret management (current tracked
`.`env` values are placeholders); edge-issued short-TTL tokens for write paths.

---

## ADR-010 — Wallet connect is sign-in-free (SIWE = explicit opt-in)

**Context.** On wallet connect, `useSyncUser` auto-invoked
`ensureWalletSession`, which popped the SIWE signature and forced a Supabase
session + `users` row before the wallet could be used. Any wallet needed this
"sync" step to be considered connected.

**Decision.** Connecting a wallet NEVER triggers the SIWE signature. Every
wallet connects freely; the app is read-only until the user explicitly signs
in via the navbar "Sign in", the SignInPrompt CTA, or an action that requires
a session (e.g. publishing an offer — Create/EditOffer already call
`ensureWalletSession`). Returning users on the same device keep the silent
`recoverWalletSession` path (success marker → no popup). Referral attribution
now fires off the live `hasSession` state (however sign-in happened) instead
of wall-connect.

**Consequences.**

- Blocking UX removed: connecting a wallet is instant, no MetaMask popup.
- Read-only browsing for unsigned wallets remains unchanged (RLS still gates
  writes; action buttons surface "sign-in required" toasts).
- Explicit sign-in paths (`force: true`) are untouched.
- The profile-onboarding redirect on first sign-in was removed with the code
  that carried it (users reach Edit Profile via the account menu).

---

## ADR-011 — Chain gate scoped to contract-write pages (browse = chain-agnostic)

**Context.** `ChainGuard` lived on every authenticated route via `AppLayout`,
so a wallet on any non-Sepolia network was greeted with a "wrong network"
banner / auto-switch attempt on every page — even though only the four escrow
surfaces (Trade, TradeDetail, Dispute, DisputeDetail) perform on-chain
reads/writes. Browsing offers, profiles, messages and the P2P DB is
chain-independent.

**Decision.** The chain requirement applies _only_ where contract interaction
happens. `<ChainGuard />` moved from `AppLayout` to the four contract pages;
everywhere else the wallet can sit on any EVM chain without prompts or
auto-switches. Where it renders, the existing auto-switch + `wallet_addEthereumChain`
fallback logic still applies (the escrow factory lives only on Sepolia).

**Consequences.**

- Connecting on mainnet/L2/anvil is fully silent outside the four escrow pages.
- Trade/dispute pages still need the correct network because `usePublicClient`
  (wagmi) resolves against the wallet's active chain and reads (allowance,
  escrow state) would target the wrong chain.
- No behavioural change on the pages that genuinely write to the contract.

---

## ADR-012 — Cookie-derived per-route cache keys at the edge

**Context.** The edge middleware (`functions/_middleware.ts`) caches public
documents via `Cache-Control: s-maxage` but the cache key ignored the requester
entirely, and there was no per-route/observable cache identity. The client also
kept the Supabase session in localStorage, so the edge never saw an HTTP cookie
to key on.

**Decision.** A shallow, security-lean identity bridge + per-route cache key:

1. **Client mirror cookie** (`src/lib/sessionCookie.ts` + `SessionCookieSync`
   hook): the connected wallet address (already public on the user's own
   `/app/profile/<wallet>` page) is mirrored into `coffernode_session`
   (`Secure; SameSite=Lax; Path=/`), synced on mount and on every Supabase
   auth event. Never a token — RLS keeps authorizing via the Supabase JWT.
2. **Edge derivation** (`functions/_lib/cache-key.ts`): `cookieIdentity()` folds
   missing/malformed cookies into a shared `anon` slot; `routeCacheKey()`
   returns `ck:v1:<pathname>:<sha256(identity)[0..16]>` — route-scoped,
   deterministic, and identity only ever stored hashed.
3. **Middleware wiring**: every document response carries `x-cache-key`; public
   routes additionally declare `Vary: Cookie` so the CDN stores per-cookie
   variants; private routes stay `no-store` (user data never cached) and only
   expose the key for observability.

**Consequences.**

- Every route — public and private — now has a cache identity bound to the
  request cookie; signed-in users stop sharing anonymous marketplace/profile
  cache entries; anonymous traffic keeps one shared slot (good hit rate).
- `Vary: Cookie` shards the CDN per cookie-set: harmless here because the app
  sets almost no other cookies (theme/lang/consent live in localStorage), and
  it is gated to public routes only.
- Security bound: the only cookie consulted is a public wallet address; the
  CDN layer never stores recognizable identities; tokens (should the app later
  add an edge auth'd route) remain out of JS cookies.
- `cache-purge` (OD-04) now targets `caches.default` URL keys; per-cookie
  variants under `Vary` are CDN-layer entries, so single-URL purge may need the
  `Cache-Rules`-aware dashboard/API purge path for those — flagged for Fase 3.

---

## ADR-013 — Self-hosted client error reporting

**Context.** A P2P/non-custodial app ships to real users, but there was no way
to know a page had broken: `src/error-logger.ts` was a no-op passthrough (it
hooked `console.error` and forwarded it), there was no React error boundary,
and no backend ever received an error. A third-party tracker (Sentry et al.)
would work but leaks error payloads — which routinely embed wallet addresses,
tx hashes and amounts — to an external vendor, against the product's
self-hosted/privacy positioning.

**Decision.** A proprietary, edge-to-DB pipeline with privacy as the default:

1. **Client capture** (`src/error-logger.ts` + `src/lib/errorReports.ts`):
   `window` `error` / `unhandledrejection` listeners plus a React boundary
   (`AppErrorBoundary`, reset on route change). Every report is scrubbed
   (EVM addresses/64-hex, emails, URL query values) and truncated, deduped by
   fingerprint within a flush window, batched, and POSTed to
   `/api/error-report` with `keepalive` (or `sendBeacon`) so unload reports
   survive. Dev builds never send; `VITE_ERROR_REPORT=0` disables in prod.
2. **Edge gate** (`functions/api/error-report.ts`): re-scrubs defensively
   (a compromised client must not ship PII), enforces an in-memory per-IP
   rate limit (100/10 min), bounds batch size (20), and appends to
   `error_logs` via the existing `SUPABASE_READ_KEY`.
3. **Storage** (migration `20260920000001_error_logs.sql`): bare rows
   (fingerprint, type, scrubbed message/stack/source, route, UA, count,
   timestamps). RLS default-deny; `anon` gets INSERT-only (it can never read
   anything back), `authenticated` gets SELECT for a future operator
   dashboard. No anon-key client writes.

**Consequences.**

- Errors are now visible end-to-end (browser → edge → SQL) with zero third
  parties and zero raw PII in Postgres. The browser never carries a write
  credential louder than the already-public anon key.
- Abuse is bounded but per-isolate: the IP bucket is in-memory per worker —
  move to KV/Durable Objects if a single isolate sees sustained traffic.
- No alerting/dashboard yet: viewing requires Supabase SQL editor or an
  `authenticated` query. Retention cleanup (purge > N days) and operator
  alerting are tracked in `docs/todo.md`.
- Source maps are NOT uploaded (matches the no-externals stance); stack
  traces stay minified — acceptable for MVP, revisit if debugging pain grows.

---

## ADR-014 — Device-bound Coffer Identity (client-derived per-label pseudonyms)

**Context.** The product goal is trading without the _counterparty_ being able
to correlate our trade/chat activity back to our on-chain wallet. The operator
must still be able to read data for anti-fraud and dispute resolution — we
chose on-chain primitives stay untouched ("layer dati" depth), and the chat
privacy model was explicitly left undecided (see Open Decisions). The earlier
sketch proposed server-side `pseudonym_*` columns fed by the `siwe-auth` edge
function. Analysis killed that idea: **a server-issued pseudonym is a mapping
the server can invert** — it disassociates nothing for the chosen threat model
and adds DB/RLS surface for zero privacy gain.

**Decision.** Identity dies on the client. The vault derives everything from
the EIP-191 `personal_sign` signature, which is _deterministic_ (RFC 6979):
same wallet + same EIP-4361 message → same bytes → same master, stable across
logins with no server involvement and no stored signature.

```
master    = HKDF-SHA256(ikm = signature bytes, salt = "coffernode:coffer:v1", info = "CofferNode identity master")
key_label = HKDF-SHA256(ikm = master, salt = domain, info = "epoch:label")
pseudonym = "CN-" + uppercase(sha256(key_label)[0..16])
```

1. **`src/lib/crypt.ts`** — pure WebCrypto helpers (`sha256*`, `hkdfSha256`,
   hex codecs), environment-agnostic (= testable in Node).
2. **`src/lib/cofferIdentity.ts`** — the vault: `deriveMasterSecret(signature)`,
   `persistCofferIdentity(address, signature)` (device-only storage),
   `cofferPseudonym` / `tradePseudonym(tradeId)` / `conversationPseudonym(id)`,
   `rotateIdentity` (epoch bump → all pseudonyms change) and `burnCofferIdentity`
   (drop the device vault). Storage is injectable for tests; the browser
   default is a single `localStorage` slot.
3. **Sign-in integration** — `signInWithWallet` derives + persists the vault
   right after the SIWE session installs, **best-effort** (identity failure
   never blocks login) and without ever persisting the signature.
4. **UI** — `CofferIdentityCard` on the own profile: identity fingerprint +
   sample trade pseudonym + Rotate (two-step confirm) + Burn (two-step).

**Consequences.**

- A counterparty sees only opaque, per-trade/per-conversation `CN-…` strings
  that hash to nothing a wallet can be recovered from. Rotating re-derives
  every label instantly, client-side.
- The master is app-layer only: it cannot move funds, cannot reconstruct the
  private key, and never leaves the device — worst case theft re-derives
  pseudonyms. Stored in `localStorage` (persistent across reloads) by design;
  a future phase could add a passphrase-locked slot.
- Server-side correlation for anti-fraud remains intact (operator reads raw
  data) — this is the accepted trade-off of "anonimità dalla controparte".
- The on-chain link (escrow contract funding) still identifies wallets at
  settlement — unavoidable without the deferred relayer/mesh phase (OD on
  "trasporto non correlabile"), and accepted at this layer.
- NO schema/RLS change landed: no `pseudonym_*` columns, no `siwe-auth` edge
  change. Follow-ups (E2E chat keys, metadata minimization) are tracked in
  `docs/todo.md`.

---

## Open decisions — Anonymità (Fase 0→3)

Recorded so the scope set in ADR-014 lives on:

- **OD-07 — Trasporto non correlabile (relayer / mesh)** — "Fluidità prima di
  tutto": 1-hop relay optional path so deposit/refund txs don't scan back to
  the app-layer pseudonym; Tor/advanced indirection explicitly not in MVP.
- **OD-08 — Minimizzazione metadati** — offer/message/session rows keep the
  raw wallet keyed only server-side; expose `CN-…` labels in any data a
  counterparty reads.
- **OD-09 — Privacy chat** — UNDECIDED (user did not answer): E2E per-
  conversation keys (derivable from the vault via `conv_key` labels),
  server-readable-but-non-correlabile, or both toggleable. Default proposal
  was server-readable non-correlabile (keeps MESSAGES_INSPECTOR / AML).
- **Fase 0 delivered so far** — vault + per-label pseudonyms + rotate/burn +
  profile card + tests + ADR-014. Schema/RLS unchanged.

---

## How to use this log

- **Accepted**: reference the ADR when it becomes relevant again (no re-litigating).
- **Proposed**: promote to Accepted only after a verifying implementation.
- **Open decisions** below map to `docs/todo.md` "Frontend — Fase 0→3".
