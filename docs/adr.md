# ADR — Registro decisioni architetturali

> Decision log for the architecture of `p2pAPP`. Each ADR records *what* was
> chosen, *why*, and its consequences. Open decisions (`OD-*`) are tracked as
> proposals with a target phase; status legend:
>
> **Accepted** = implemented and verified · **Proposed** = agreed direction, not yet built · **Deferred** = parked, revisit later

---

## Table

| ID | Decision | Status | Date |
|----|----------|--------|------|
| ADR-001 | Route-level code splitting via `React.lazy` + layout-owned Suspense | Accepted | 2026-09-13 |
| ADR-002 | Lazy i18n: only `en` bundled, other locales via `import.meta.glob` | Accepted | 2026-09-13 |
| ADR-003 | Vendor chunk buckets via `manualChunks` + build budget | Accepted | 2026-09-13 |
| ADR-004 | Shared skeleton fallback (`AppPageFallback`, `aria-busy`) | Accepted | 2026-09-13 |
| ADR-005 | Offer is consumed at trade creation (one-shot marketplace rule) | Accepted | 2026-09-13 |
| ADR-006 | Route/chunk/i18n verification baseline: Playwright (Chromium) | Accepted | 2026-09-13 |
| ADR-007 | Edge document layer + client-side edge-data hydration | Accepted (live deploy verified) | 2026-09-13 |
| ADR-008 | Restricted public reader: `anon` column-level projection (DB + worker + client) | Accepted | 2026-09-13 |
| OD-01 | Defer the wallet stack off the critical path | Proposed (Fase 3) | 2026-09-13 |
| OD-02 | Restricted reader role + minimal public projection | Accepted (Fase 1: DB column projection; anon-key removal deferred to BFF) | 2026-09-13 |
| OD-03 | Per-route edge behaviour via `functions/_middleware.ts` + `_routes.json` (public → inject data + `s-maxage`; private → `no-store`) | Implemented in repo (deploy pending) — see ADR-007 | 2026-09-13 |
| OD-04 | Edge-cache invalidation via Supabase write webhooks (`/api/cache-purge`) | Implemented in repo (webhook config pending) | 2026-09-13 |
| OD-05 | Security headers (`_headers` CSP/HSTS) + drop anon key from the bundle | Partially implemented (headers live); anon-key removal deferred to BFF phase (keep OD-02 carve-out) | 2026-09-13 |

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
  `/assets/`) serves every *document* navigation. PUBLIC routes (landing, docs,
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

## Open decisions

### OD-01 — Defer the wallet stack (Fase 3)
wagmi/rainbowkit/walletconnect ≈ 3 MB ride the initial load because the shell
imports them for sign-in. **Direction:** lazy-mount the Connect button and the
wallet providers on first interaction; landing/docs/offers then ship without
`web3`. Proved convex to ADR-001/003; verify against RLS/anon gates.

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

## How to use this log
- **Accepted**: reference the ADR when it becomes relevant again (no re-litigating).
- **Proposed**: promote to Accepted only after a verifying implementation.
- **Open decisions** below map to `docs/todo.md` "Frontend — Fase 0→3".