# Live Test Checklist — full end-to-end pass

> Runbook per il "test totale" sull'ambiente **live** (cutover SIWE+RLS completato
> 2026-08-30). Compila la colonna **Esito** ([P]ASS / [F]AIL / [S]KIP + nota) man
> mano che esegui ogni passo. Il blocco *Automated gates* si esegue da CLI; i
> passi manuali richiedono due browser (profili separati) con **due wallet
> diversi**.
>
> Ambiente: `tauyciaavhnopeseecmz.supabase.co` — RLS in enforcement, default-deny,
> retention messaggi 40gg attiva, poll-fallback chat 5s/15s attivo.

---

## 0 · Automated gates (CLI) — esito al 2026-08-30

| # | Comando | Esito |
|---|---------|-------|
| A1 | `npx vitest run` (tutta la suite, incl. security 63) | ✅ 63/63 |
| A2 | `npm run typecheck` | ✅ |
| A3 | `npm run build` (tsc -b + vite build) | ✅ (dopo fix `useSyncUser` → `signMessageAsync`) |
| A4 | `npm run lint` | ⚠️ 7 errori pre-esistenti `react-refresh/only-export-components` in `src/components/*` — non introdotti da questo lavoro |

> Runbook al 2026-08-30 → [P] ogni riga. I 7 lint error sono noti/accettati
> (fast-refresh rule sui file che esportano anche costanti).

---

## 1 · Prerequisiti

- [ ] Browser A e B su profili separati (es. normale + incognito), entrambi su `localhost:5173`
- [ ] Wallet A (R) e Wallet B (S) **diversi**, collegati uno per browser
- [ ] Un trade richiede fondi su chain + gas: pronto un piccolo budget per gli step on-chain

---

## 2 · Auth & identities

| # | Passo | Atteso | Esito |
|---|-------|--------|-------|
| P1 | Connect wallet (A). Firmare il challenge SIWE. | App va su `/app/profile/edit` se profilo assente; nessuna firma persistita in localStorage (`coffernode:siwe:last` contiene solo address+issuedAt) | |
| P2 | Prendi il JWT di sessione (Application → Cookies/Local Storage Supabase). Decodifica. | Claim `wallet_address` presente, sub = users.id | |
| P3 | Connect wallet (B) sul browser B. | Stessa sequenza P1, utente diverso | |
| P4 | Logout (A) + riconnetti. | Nuova challenge con nonce fresco; la vecchia sessione non riusabile | |
| P5 | Navigatore non collegato (disconnect B). | Link "Profilo" sparito dal navbar; accesso immediato a `/app/...` negato | |

---

## 3 · RLS — isolamento cross-user (il cuore della sicurezza live)

| # | Passo | Atteso | Esito |
|---|-------|--------|-------|
| R1 | Da browser A, apri direttamente una URL di chat/finestra offer di B (copia URL da B). | Nessun dato B visibile ad A: lista vuota / 403, nessun leak di row | |
| R2 | Da A, chiama nel console `supabase.from('messages').insert(...)` come appartenente a estraneo. | `violates row-level security policy` | |
| R3 | Da A, prova UPDATE/INSERT su utente di B (`users`/`offers`/`trades/id-esterno`). | Rifiutato | |
| R4 | Da A, prova a leggere una `conversation_participants` di una conversazione tua. | OK (sei partecipante) | |
| R5 | "Ghost-guard": `siwe_nonces` / `siwe_auth_links` leggibili da anon. | Nessun accesso | |

---

## 4 · Chat & notifiche (2 browser)

| # | Passo | Atteso | Esito |
|---|-------|--------|-------|
| C1 | A manda un messaggio a B. | B lo vede live (realtime ≤1s se publication attiva, altrimenti ≤5s poll) senza refresh | |
| C2 | B risponde. | A lo vede; ordine cronologico corretto (ms meritati: paginazione composita `created_at,id`) | |
| C3 | Nessuna duplicazione né messaggi fuori ordine durante burst rapidi. | Id univoci, ordine stabile | |
| C4 | "Load older" fino a >40 messaggi. | Nessun buco in cronologia; dedup ok | |
| C5 | Campanella notifiche + badge unread conversazione. | Conteggio giusto (è un partecipante che scrive; lo zero non prematuro) | |
| C6 | Typing indicator + presenza online. | Appaiono/scompaiono col debounce | |
| C7 | A manda e disconnette subito il wallet. | Timeline sessione chiusa; messaggio comunque visibile a B al refresh | |
| C8 | Messaggio con testo >200 char. | Preview sidebar troncato a 200+… | |

---

## 5 · Trade lifecycle (on-chain)

> Serve catena configurata (RPC pubblico `eth.merkle.io` ha CORS su browser —
> se il deposit fallisce per fetch, è quello, non il codice).

| # | Passo | Atteso | Esito |
|---|-------|--------|-------|
| T1 | A crea offer (buy). | Riga `offers` visibile in lista, autorizzata RLS | |
| T2 | B accetta → trade creato → conversazione auto-creata. | Chat A/B pronta con ruoli buyer/seller | |
| T3 | B deposita nell'escrow (approve + deposit). | Solo importi esatti (no maxUint); `escrow_status` aggiornato | |
| T4 | B scatta il meccanismo di lock/constraint. | `status='locked'`, composer chat disabilitato | |
| T5 | A conferma e fa `release`. | Pagamento → reputazione aggiornata (±3/±2); trade chiuso | |
| T6 | Cancel con timelock 1gg. | Visibile solo in funding-phase; bloccato entro il timelock | |

---

## 6 · Dispute & evidence

| # | Passo | Atteso | Esito |
|---|-------|--------|-------|
| D1 | A alza una dispute su un trade attivo. | Riga `disputes` + link trade; upload evidence in `dispute_evidence` | |
| D2 | B risponde con contro-evidence. | Entrambi i set visibili; solo i partecipanti | |
| D3 | `executeRuling` / `finalize` / `timeout`. | `disputes.on_chain_ruling` sincronizzato da `updateDisputeOnChain` | |
| D4 | Rating modale post-trade. | `user_ratings` + `reputation_scores` aggiornati (delta −2..+2) | |

---

## 7 · Retention & igiene

| # | Passo | Atteso | Esito |
|---|-------|--------|-------|
| G1 | Verifica job cron attivo | `cron.job` contiene `purge-old-messages` (schema `cron`) | |
| G2 | (opz.) Insert manuale di un messaggio con `created_at` 41gg fa, poi esegui il job una volta e rileggi. | Il messaggio sparisce; `notifications` collegate rimosse; `last_read_message_id` appesi azzerati; preview sidebar ricalcolata | |
| G3 | Scrollbar chat/sidebar | Nessuna barra visibile; scroll con rotellina/touch | |

---

## 8 · Known-risks / da verificare prima del "tutto verde"

- [ ] `trade_ratings` 400 nel console (RPC/view mancante live?) — da investigare col primo run
- [ ] Realtime publication: se non eseguita, chat su polling (atteso C1 a ≤5s)
- [ ] `Escrow.sol` / `EscrowFactory.sol` / `unlockAfterTimeout` **non** `.sol`-verified (gap §6 del penetration matrix)
- [ ] `messages.kind` resta client-uthorized (nessuna enforcement server su `system`)
- [ ] Mirror-writes indexer-only ancora da fare (updateTradeStatus / updateDisputeOnChain / ratings via SECURITY DEFINER firmato)

---

## Esito complessivo

| Blocco | PASS / FAIL |
|--------|-------------|
| 0 · Automated gates | [P] con nota A4 |
| 2 · Auth | ☐ |
| 3 · RLS | ☐ |
| 4 · Chat | ☐ |
| 5 · Trade | ☐ |
| 6 · Dispute | ☐ |
| 7 · Retention | ☐ |

Data completamento: ____________