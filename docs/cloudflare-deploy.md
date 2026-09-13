# Runbook — Cloudflare Pages deploy (Fase 2 edge layer)

> Deliverable of Fase 2 (see `docs/adr.md` ADR-007, OD-03/04). This runbook is
> the **remaining manual path** between "code in repo" and "live edge layer".
> Estimated time: ~20–30 min.

---

## 0. Prerequisiti

- Progetto Cloudflare esistente + account con accesso `wrangler` (CLI locale già
  in `devDependencies`).
- Progetto Supabase `tauyciaavhnopeseecmz.supabase.co` (già usato dall'app).
- La **chiave anon** (`VITE_SUPABASE_ANON_KEY` in `.env.local`) come
  `SUPABASE_READ_KEY` per ora. Server-side only: **mai** esposta ai browser.
  (Fase 1 / OD-02 la sostituirà con un ruolo reader ristretto — il middleware
  non cambierà.)

---

## 1. Preparazione locale (una tantum)

```bash
# Verifica il login wrangler
npx wrangler whoami

npm run build                 # Vite → dist/
npx wrangler pages project create coffernode   # prima volta; stesso nome di wrangler.toml
```

> Nota macOS: `wrangler pages dev` non gira su OS ≤ 13.4 (workerd). Il deploy
> da terminale funziona comunque (il runtime gira su Cloudflare, non in locale).

---

## 2. Secrets

```bash
npx wrangler pages secret put SUPABASE_READ_KEY --project-name coffernode
#   incolla la chiave anon SUPABASE (publishable/anon rimane ok)
npx wrangler pages secret put PURGE_SECRET --project-name coffernode
#   genera una stringa lunga e casuale, es.:
#   openssl rand -hex 32
```

- `SUPABASE_URL` è già in `wrangler.toml` `[vars]` (non è un segreto).
- `.dev.vars` (gitignored) serve solo al dev locale.
- **Nota**: se crei il progetto con un nome diverso da `coffernode`, aggiorna
  `--project-name` e `wrangler.toml`.

---

## 3. Deploy

```bash
npm run deploy:cf
# = npm run build && wrangler pages deploy dist --project-name coffernode
```

Output atteso: URL produzione `https://coffernode.pages.dev` (+ preview branch).

---

## 4. Verifiche funzionali (post-deploy)

```bash
BASE=https://coffernode.pages.dev

# 4.1 Rotta PRIVATA → no-store, niente dati
curl -sI "$BASE/app/messages" | grep -iE "cache-control|x-edge-route"
#  atteso: cache-control: no-store · x-edge-route: private

# 4.2 Rotta PUBBLICA → cache edge + dati iniettati
curl -sI "$BASE/app/offers" | grep -iE "cache-control|x-edge-route"
#  atteso: public, max-age=0, s-maxage=300, SWR · x-edge-route: public
curl -s "$BASE/app/offers" | grep -c "__EDGE_DATA__"
#  atteso: ≥ 1 (il blob di pubblico è dentro la shell)

# 4.3 Dettaglio offerta pubblico (sostituisci con un id reale)
curl -s "$BASE/app/offer/<UUID>" | grep -o '"pathname":"[^"]*"'

# 4.4 HSTS/CSP
curl -sI "$BASE/" | grep -iE "content-security-policy|strict-transport|x-frame"

# 4.5 Test browser (modalità finto-edge già coperta in CI locale)
npm run test:e2e
```

### 4.6 Invalida una rotta a mano (sanity del purge endpoint)

```bash
# senza segreto → 401
curl -s -X POST "$BASE/api/cache-purge" \
  -H 'content-type: application/json' \
  -d '{"table":"offers"}'
# atteso: 401 {"error":"unauthorized"}

# con segreto → 200 e lista purga
curl -s -X POST "$BASE/api/cache-purge" \
  -H 'content-type: application/json' \
  -H "x-webhook-secret: $PURGE_SECRET" \
  -d '{"table":"offers","type":"INSERT"}'
# atteso: {"ok":true,"purged":[".../app/offers"],"failed":[]}
```

---

## 5. Webhook Supabase → purge cache

> Collega il DB alle modifiche delle offerte/utenti così `s-maxage` non serve
> mai dati stale. (OD-04)

1. Dashboard Supabase → Database → **Webhooks** → **Create a webhook**.
2. Sorgente: `offers` (INSERT + UPDATE + DELETE).
   - Riga: **qualsiasi**
   - HTTP: alias libero, **POST**
   - URL: `https://coffernode.pages.dev/api/cache-purge`
   - Headers custom: aggiungi `x-webhook-secret` = tuo `PURGE_SECRET`
   - Content-type: `application/json`
3. Ripeti per `users` (almeno UPDATE, per l'aggiornamento profilo).
4. Salva e verifica con 4.6 dopo aver creato/modificato un'offerta:

```bash
# crea/aggiorna un'offerta nel dashboard, poi
curl -sI "$BASE/app/offers" | grep -i cache-control     # s-maxage parte fresco
curl -s "$BASE/app/offers" | grep -c "__EDGE_DATA__"     # dati aggiornati
```

---

## 6. Verifica finale in browser

1. Aprì un deep link pubblico pulito: `https://coffernode.pages.dev/app/offers`
   → deve renderizzare l'elenco **senza skeleton flash** (dati già nel HTML).
2. Ctrl+R su una rotta privata (`/app/messages`) → nessun dato nel HTML,
   pagina gated client-side (SIWE), header `no-store` nelle DevTools.
3. Regola le reti/flight simulator solo se serve testare `?edge-data=0` (opt-out
   console del middleware, per confrontare shell bare vs iniettata).

---

## 7. Rollback

- Cloudflare Pages mantiene le **versions**: Dashboard → Workers & Pages →
  `coffernode` → **Deployments** → promuovere la precedente.
- CLI: `npx wrangler pages deployment list --project-name coffernode` e
  `npx wrangler pages deployment promote --id <deployment-id> --project-name coffernode`.

---

## 8. Checklist finale

- [x] `wrangler whoami` ok (API token account-scoped; il token R2 `cfat_…` va bene anche per Pages se ha `Pages: Edit` + `Workers Scripts: Edit`)
- [x] Progetto Pages `coffernode` creato
- [x] `SUPABASE_READ_KEY` e `PURGE_SECRET` settati come secrets (produzione)
- [x] `npm run deploy:cf` verde (ora include `--branch main` → va in produzione; senza branch finisce su preview `master` senza secrets e `/api/cache-purge` risponde 500 "purge secret not configured")
- [x] 4.1 `no-store` su privato · 4.2 `public,s-maxage` + `__EDGE_DATA__` su pubblico
- [ ] 4.6 purge endpoint: 401 senza segreto, 200 con segreto — *verificato live, spuntare se ri-esegui*
- [ ] Webhooks Supabase su `offers`/`users` → `/api/cache-purge` (sez. 5)
- [ ] Deep link pubblico senza flash + privato gated (sez. 6)
- [ ] Aggiornare `docs/todo.md` → spuntare "Fase 2 — DEPLOY + live verify" — *fatto*

> **Gotcha curl**: `curl -I` / `curl` senza `Accept: text/html` mandano `Accept: */*` → il middleware
> li tratta come non-document e fa `next()` (niente `x-edge-route`, niente blob). Sempre
> `-H 'Accept: text/html'`.

---

## Note di mantenimento

- **Mai** mettere `SUPABASE_READ_KEY`/`PURGE_SECRET` in file committati
  (`.dev.vars` è gitignored).
- **OD-02 shipped (2026-09-13)**: l'anon role legge solo la proiezione pubblica.
  Le liste di colonne sono duplicate in tre posti e DEVONO stare in sync:
  `supabase/migrations/20260915000002_od02_public_reader_projection.sql`,
  `functions/_lib/public-data.ts` e `src/lib/supabase/index.ts`
  (`PUBLIC_OFFER_COLUMNS` / `PUBLIC_USER_COLUMNS` / `SELLER_JOIN`).
- **Un nome migration = un file, versioni tutte diverse**: due file
  `20260913000001_*` hanno mascherato una migration da `db push` (riparata
  rinominandole in `20260915000003`/`20260915000004` + `migration repair
  --status reverted` + `--include-all`). Se devi ri-applicare una versione già
  marcata apply: `supabase migration repair --status reverted <version>` poi
  `supabase db push --linked --include-all` (con `<<< "y"` se noninterattivo).
  `db push` va in una sola transazione per file: un errore fa rollback completo
  (anon resta col grant precedente, sito non rotto).
- Le rotte pubbliche sono: `/`, `/docs*`, `/app/offers`, `/app/offer/:id`,
  `/app/profile`, `/app/profile/:addr` (exclude `/edit`). Tutto il resto è privato
  — aggiorna `isPublicRoute()` in `functions/_middleware.ts` quando il dominio
  pubblico cambia.