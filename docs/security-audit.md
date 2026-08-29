# Security Audit — CofferNode P2P

> Full-stack audit of every flow: auth/SIWE, offers, trades/escrow, disputes,
> ratings/reputation, chat/real-time, notifications/email, profile/storage.
> Lines verified against the codebase and migrations at the time of writing.
> Re-verify against HEAD before acting on any line reference.

---

## Executive summary

The **on-chain escrow and user funds are the resilient part of the system** —
DB compromise cannot move funds. Everything off-chain is the weak layer:
Supabase is treated as a trust-less cache of on-chain state *and simultaneously*
as the platform's identity / reputation / chat / notification layer, yet **every
one of its 26 RLS policies is `to anon, authenticated using (true)`**.

Wallet identity ("this request comes from wallet X") is verified **client-side
only** (`src/lib/siwe.ts`) and never re-asserted by the server, so **every
write path is forgeable by anyone holding the public anon key**. This is a
deliberate "permissive until SIWE lands" posture that documented but **never
landed**.

### Severity rollup

- **Critical (2)** — no server-side authorization on any table; unauthenticated email relay
- **High (6)** — escrow clone-verification missing, message spoofing, reputation RPC sink, realtime wiretap, trade/dispute state forgery, mass-assignment writes
- **Medium (5)** — avatar storage overwrite/HTML hosting, typing/presence spoofing, SIWE signature persisted, email pivot via preferences, SECURITY DEFINER search_path hygiene
- **Low (3)** — `Math.random()` id generation, unbounded user cache in localStorage, tracked env keys / live Resend key on disk
- **Clean** — XSS (React auto-escapes; zero `dangerouslySetInnerHTML`), open redirects, third-party scripts, error-logger exfiltration, secrets in git history

---

## 1. Identity & sign-in flow (SIWE)

**Critical — no server-side authentication.**

- `src/lib/siwe.ts:106-124` verifies the `personal_sign` signature **in the
  browser** with viem.
- `src/lib/supabase/index.ts:1722-1774` (`signInWithWallet`) verifies locally,
  then just inserts the `users` row via the anon key and stores a localStorage
  marker (`coffernode:siwe:last`). **No Supabase session/JWT is ever minted.**
- `useSyncUser.ts` / `useCurrentUser.ts` call `ensureUser()` on connect, which
  is a plain PostgREST insert.

Consequences (direct REST calls, no wallet needed):

| Vector | Impact |
| --- | --- |
| `users` INSERT `with check (true)` | Squat any `wallet_address` before the real owner onboards |
| `users` UPDATE `using (true) with check (true)` | Set `role='admin'`, `verification_level='trusted'`, `reputation_score=100` on any row; rewrite `wallet_address` (identity takeover) |
| All downstream ids sourced from client args | Trades, ratings, disputes, messages — all forgeable |

**Interim (done — P0):** none possible without a real auth boundary.
**Fix (landed 2026-08-29, deploy pending):** SIWE edge function that
(a) validates the signature against a server-stored one-shot nonce,
(b) mints a Supabase JWT carrying a `wallet_address` claim (sub = a provisioned
GoTrue auth user, needed for `auth.setSession`), and (c) rewrites every policy
to bind writes to that claim via `public.current_user_id()` (JWT
`wallet_address` → `users.id`), leaving `auth.uid()` out of the decision
(`supabase/migrations/20260829000002_siwe_auth_rls.sql`). See the deploy
runbook in `docs/todo.md` before pushing.**

**Medium — SIWE signature persisted (fixed 2026-08-29):**
`signInWithWallet` used to store `{ address, nonce, issuedAt, signature }` in
localStorage. The signature was the strongest credential the app ever held.
Now it stores only `{ address, issuedAt }`.

---

## 2. Data layer / RLS

**Critical — functionally no RLS anywhere.** All 26 policies across 8 migration
files are `to anon, authenticated using (true) with check (true)`:

Migrated tables and what an anonymous caller can do today:

| Table | Anon can... | Migration |
| --- | --- | --- |
| `users` | read all profiles; insert any wallet; set `admin`/`trusted`; takeover rows | `20260101000000:121-135`, `20260626000000:19-30` |
| `offers` | claim any `seller_id`, set `featured`, alter victims' prices | `20260101000000:191-202`, `20260626000002:12-22` |
| `trades` | read all trades incl. `payment_details`; create fake trades (auto-spawns conversations); flip status/escrow mirrors | `20260626000003:142-159` |
| `conversations` / `conversation_participants` / `messages` | read all chat, **spoof messages as any user**, add yourself to conversations, **delete chat history (evidence destruction)** | `20260724000004:171-192` |
| `disputes` / `dispute_evidence` / `trade_ratings` / `reputation_*` | forge rulings/`winner`, self-rate, rate anyone, edit reputation | `20260814000001:200-223` |
| `notifications` / `notification_preferences` | read/delete any feed; set anyone's email → email pivot (§6) | `20260724000005:142-152` |
| `storage.objects` (avatars) | overwrite victims' avatars; host arbitrary HTML/SVG on project origin | `20260829000000:21-38` |

**Fix:** wallet-scoped policies (P1, one migration). Shape:

```sql
-- users: only yourself
create policy users_active_self on public.users for update to authenticated
  using (lower(auth.jwt()->>'wallet_address') = lower(wallet_address))
  with check (lower(auth.jwt()->>'wallet_address') = lower(wallet_address));

-- messages: only participants, sender = you
create policy messages_participant on public.messages for all to authenticated
  using (exists (
    select 1 from conversation_participants p
    where p.conversation_id = messages.conversation_id
      and p.user_id = auth.uid()))
  with check (new.sender_id = auth.uid());

-- trades: only buyer/seller
create policy trades_parties on public.trades for all to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid());
```

Add a **default-deny** catch-all (`to anon using (false)`) so forgotten tables
fail closed. Also add `set search_path = public` to the three SECURITY DEFINER
chat triggers and delete the shotgun `alter function ... security definer`
loop in `20260626000001:15-29` (it also references a `wrap_user_private`
function that **does not exist** in this repo).

---

## 3. Escrow & payments flow

**Critical/High — fund-moving target comes from the DB or the URL, never
verified against the factory.**

- Approve + deposit render against `escrow_address` sourced from the `trades`
  row / `?escrowAddress=` query param (`TradeDetailPage.tsx:191-192`;
  `DisputePage.tsx:138,153,158`).
- The factory's `escrowByBuyer` / `escrowBySeller` / `implementation()` are in
  the ABI (`contracts.ts:194-204`) but only used to *list your own escrows* /
  event-decode fallback — **never to validate a DB- or URL-supplied address**
  before a fund move.
- Because `trades` is anon-writable (§2), an attacker can create a trade whose
  escrow address is **their own contract**. A buyer clicking "Approve & Post
  Deposit" approves the USDC spend allowance to the attacker. This DB→funds
  chain is the most dangerous bug in the app.

Additional issues:

- `approve(escrow, maxUint256)` — an unlimited allowance. Prefer exact-amount
  approvals (total of both deposits) so a later compromise/upgrade can't drain.
- `DisputePage` accepts an escrow address from the query string; remove that
  bypass in the rewrite.
- Deposit/grace terms come from whoever posts first rather than a signed
  pre-commitment on the offer — move terms to the offer row with an explicit
  seller acceptance step.

**Fix (P1):** before every approve/deposit/dispute call, require
`escrowByBuyer(tradeId)` / `escrowBySeller(tradeId)` (or a bytecode/
`implementation()` match on the factory) to return the expected address;
hard-fail and render no buttons otherwise.

---

## 4. Disputes, ratings & reputation flow

**High — outcome mirrors are client-writeable.**

- `updateDisputeOnChain` (`src/lib/supabase/index.ts:947-1004`) lets any caller
  set `winner`, `on_chain_ruling`, `escrow_state`, `status` on any dispute —
  the UI can display any verdict.
- `createDispute` / `insertDisputeEvidence` take arbitrary `trade_id` /
  `buyer_id` / `seller_id` and an attacker-chosen `ipfs_url` (rendered as a
  link).
- `submitTradeRating` takes arbitrary `rater_id` / `rated_id` / `trade_id` —
  self-ratings and rating users on trades you weren't in (the only guard is
  `unique(trade_id, direction)`).

**High — reputation RPC is an unauthenticated sink (interim-hardened P0):**
`increment_reputation_score` (`20260814000001:154-192`) is SECURITY DEFINER,
callable by `anon` for **any `user_id` and any `delta`** — reputation pump/
tank and an unbounded `reputation_points` ledger flood (it is also the trigger
behind `TradeDetailPage.tsx:348-349` and `useReviews.ts:81`).

- **Interim (done — P0):** deltas now hard-bounded to ±10 and NULL `user_id`
  rejected (`20260829000001_security_p0_hardening.sql`). Legit UI only ever
  sends ±2 (score − 3), so real behavior is unchanged.
- **Fix (P1):** revoke `EXECUTE` from `anon` once JWT auth exists; the indexer
  (or a SIGNATURE-checking security-definer fn) should be the only writer of
  `winner` / `on_chain_ruling` / reputation, cross-checked against the chain.

---

## 5. Chat & real-time flow

**High — realtime wiretap.** `useMessages.ts:31-72`, `useConversations.ts:
29-36,62-74`, `useNotifications.ts:34,82`, and `NotificationDispatcherHost.tsx:
26-65` subscribe to `postgres_changes`. RLS being open, an anon client can
subscribe with **no filter** and stream every private message/notification in
real time.

**High — message spoofing.** `sendMessage` takes `sender_id` from the client
(`useMessages.ts:105`, `index.ts:1516-1548`) → impersonate anyone, forge
`kind:'system'`, and message people you're not in a conversation with. The
`notify_conversation_message` trigger then fans attacker text out as
notifications to every other participant.

**Medium — typing/presence spoofing.** `typing:${id}` / `presence:${id}`
broadcast channels (`useTypingIndicator.ts:37,148`) are public and their ids
leak via URLs; nicknames/online-state can be harvested and fake
"Alice is typing…" events sent. Drop `nickname` from typing payloads and/or
move to server-authorized channels once JWT auth lands.

**Fix:** the §2 RLS rewrite fixes the wiretap; force `sender_id` server-side
from the JWT; restrict `kind` to server-set values (never client `system`).

---

## 6. Notifications & email flow

**Critical — unauthenticated email relay (hardened P0).**

- `supabase/functions/send-email/index.ts` was deployed `--no-verify-jwt`,
  CORS `*`, accepting arbitrary `to`/`subject`/`text`/`html` → a free spam /
  phishing relay from the project's Resend account (fake "claim your trade"
  HTML emails, financial cost).
- Compounded by `notification_preferences` being anon-writable — an attacker
  could set any victim's `email_address` + enable email and steer the victim's
  own browser into mailing arbitrary addresses.

**Interim (done — P0):**
- Recipient is now **resolved server-side** from `notification_preferences`
  (`user_id` → `email_address`); the client never sends an address.
- `html` is refused outright — text-only relay.
- Per-recipient rate limit (2 / 60s) + subject/text CRLF stripping and length
  caps; CORS locked to `coffernode.app` + localhost.
- Client channel (`src/lib/notifications/channels/email.ts`) sends only
  `{ user_id, subject, text }` and no longer logs addresses.

**Remaining (P1):** deploy with `--verify-jwt` + verify `user_id` is the
calling user once SIWE JWT exists; the sender/origin of the relay must be
immune to prefs tampering (comes free with the §2 rewrite). Rotate the Resend
key that was present in `.env.local` (gitignored; not in history).

---

## 7. Profile, storage & avatar flow

**Medium.**

- `uploadAvatar` upstream passes an attacker-relative upload; the storage
  policy is bucket-scoped only (`20260829000000:27-38`) → overwrite victims'
  avatars, host arbitrary SVG/HTML on the project origin.
- `updateUserProfile` upserts keyed only on `wallet_address`
  (`index.ts:253-296`) with no ownership check — overwrite any existing
  profile by passing the target address.
- `avatar_url` / `website` are stored unvalidated. `website`/social handles are
  not rendered today, but must be per-field validated **before** any UI links
  them (they would leak into `<a href>` unsanitized).

**Fix:** storage path must be `${auth.uid()}/...`; validate `avatar_url` to
`https://` + the storage bucket origin; per-field validators.

---

## 8. Client hardening

- **XSS: clean.** No `dangerouslySetInnerHTML` / raw HTML sinks anywhere; React
  auto-escapes all user content.
- **Open redirects: clean.** All links use fixed base domains; navigation uses
  fixed React Router prefixes.
- **Id generation — Low.** `generateOfferId/TradeId/DisputeId` use
  `Math.random()` (`index.ts:429-504`); switch to `crypto.randomUUID()`.
- **Cache — Low.** `src/lib/userCache.ts` stores full profiles per browsed
  wallet in localStorage, unbounded, cleared only for the signed-in wallet.
  Use sessionStorage + LRU cap + purge on sign-out.
- **Real-time hygiene.** Until RLS lands, avoid whole-table `postgres_changes`
  subscriptions from privileged-looking components.

---

## 9. Rate limiting & abuse

No rate limiting anywhere (P0 added one in the email relay). Unlimited anon
inserts, storage uploads (up to 50 MiB each), and ledger floods are possible.
Layer `auth.rate_limit` on the SIWE endpoint, storage per-path size caps, and
edge quotas in P1/P2.

---

## 10. Secrets & config

- No service-role key or admin URL in `src/`. `.env`/`.env.example` carry only
  public anon/publishable keys (expected — they ship in the bundle).
- **Low:** `.env.local` contained a live Resend key, protected only by the
  blanket `*.local` gitignore — move to `supabase secrets set` with a
  placeholder in tracked files, and **rotate** the leaked key.
- Edge function uses `Deno.env.get()` for `RESEND_API_KEY` / `EMAIL_FROM` —
  keep those as `supabase secrets`, never in the repo.

---

## Remediation roadmap

| Priority | Item | Status |
| --- | --- | --- |
| **P0** | Email relay: server-resolved recipient, no `html`, CRLF/size caps, rate limit, CORS lock | ✅ shipped (2026-08-29) |
| **P0** | `increment_reputation_score` delta bound + NULL guard | ✅ shipped (2026-08-29) |
| **P0** | Resend key rotation + move to `supabase secrets` | ⬜ ops action |
| **P1** | SIWE edge function + JWT mint + rewrite the 26 RLS policies (users → offers → trades → chat → notifications) | ✅ code+SQL landed (2026-08-29); **deploy pending** — see todo.md cutover runbook |
| **P1** | Escrow address verification (`escrowByBuyer/Seller` + implementation match) before any fund move; exact-amount approvals; remove `queryEscrow` | ⬜ todo.md |
| **P1** | Force `sender_id`/`kind` server-side; stop browser writes to trade/dispute/rating mirrors (indexer-only) | ⬜ todo.md |
| **P1** | Storage path-owner policy for avatars; `updateUserProfile` ownership check | ⬜ todo.md |
| **P2** | `crypto.randomUUID()` ids; typing/presence payload trimming; cache hygiene (userCache → sessionStorage); remove shotgun definer loop | ⬜ todo.md |