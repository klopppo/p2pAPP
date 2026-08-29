# Penetration Test Matrix — allow/deny across contracts, RLS, and edge functions

> **Code-verified, not live-probed.** Every claim below is corroborated by an
> executable check in `tests/security/*.spec.ts` (vitest). Run it with:
>
> ```bash
> npm run test -- tests/security
> ```
>
> `npm run typecheck` and `npx eslint tests supabase/functions/_shared`
> must stay green alongside it.
>
> ⚠️ **Deployment caveat throughout:** the RLS posture documented in §4 is the
> **state the migrations declare**, which only exists **after**
> `supabase db push` (20260829000002). Until the SIWE+RLS cutover deploys, the
> live database still runs the permissive baseline this file replaces. A test
> (`rls-policy.spec.ts` → "pre-cutover reality check") *proves* anon write
> policies exist in the pre-cutover migration set — deploy order matters.

---

## 1. Scope and evidence model

Every function/command is classified **ALLOWED** (caller list) or **DENIED**
(every caller type not listed). Evidence rank:

| `source`          | Meaning                                                              |
| ----------------- | ------------------------------------------------------------------- |
| `contract-doc`    | Stated by `docs/contract-execution-status.md` / `dispute-status.md` / `factory-admin-runbook.md` + KlerosEsc NatSpec referenced from `src/lib/contracts.ts`. |
| `abi`             | Derivable from the ABI + constants in `src/lib/contracts.ts`.        |
| `client-gate`     | Enforced by a frontend action gate (mirrors the contract).           |
| `unverified`      | **Audit gap** — the repo here cannot prove it; verify against `.sol` in `contrats/`. |

Caller in a matrix row means "these roles may call"; **absent roles are denied**.
`either` = buyer or seller (never a third party); `anyone` = permissionless
(keeper pattern); `court` = the pinned Kleros Court via the ERC-792 callback.

---

## 2. KlerosEsc — 39 ABI functions (13 mutating + 26 views)

Verified by `escrow-access-control.spec.ts` "contract surface" blocks: the ABI in
`src/lib/contracts.ts` must contain exactly the 13 mutating set and all 26 views;
client pages must only expose gates that honour callers.

### 2.1 Mutating (state-changing)

| Function                 | ALLOWED      | DENIED                          | State                              | Evidence |
| ------------------------ | ------------ | ------------------------------- | ---------------------------------- | -------- |
| `depositBuyerSecurityDeposit` | buyer   | everyone else                   | `AWAITING_FUNDING`                 | contract-doc |
| `depositSellerSecurityDeposit`| seller  | everyone else                   | `AWAITING_FUNDING`                 | contract-doc |
| `lockFunds`              | seller       | everyone else                   | `AWAITING_FUNDING`, after buyer dep.| contract-doc |
| `confirm`                | buyer        | everyone else                   | `FUNDED`                           | contract-doc |
| `cancelTrade`            | either       | third parties, role-less callers| `AWAITING_FUNDING` + 1-day timelock | contract-doc + client-gate |
| `release`                | anyone       | —                                | `CONFIRMED_PENDING`, grace elapsed | contract-doc + client-gate |
| `raiseDispute`           | either       | third parties, role-less callers| `FUNDED`/`CONFIRMED_PENDING` window| contract-doc + client-gate |
| `submitEvidence`         | either       | third parties, role-less callers| `AWAITING_RULING`/`RULING_RECEIVED`| contract-doc + client-gate |
| `appeal`                 | either       | third parties, role-less callers| `APPEALABLE(1)` within window      | contract-doc |
| `rule`                   | court        | everyone else                   | `AWAITING_RULING` (ERC-792 cb)     | contract-doc ⚠ §6 |
| `executeRuling`          | anyone       | —                                | `RULING_RECEIVED`                  | contract-doc + client-gate |
| `finalize`               | anyone       | —                                | `RULING_EXECUTED`                  | contract-doc |
| `timeoutDispute`         | anyone       | —                                | `AWAITING_RULING`/`RULING_RECEIVED` ≥ 30d | contract-doc |

Arbitration meta-constraints (constants in `src/lib/contracts.ts`, asserted by
tests): rulings `0..4` via `NUMBER_OF_CHOICES = 4n` (`_ruling > 4` reverts);
grace default 7d / max 365d; cancel timelock 1d; dispute timeout 30d; security
deposit MIN 1% / MAX 15% / default 10%.

### 2.2 Views (read-only, `anyone`)

`token, buyer, seller, treasury, klerosCourt, klerosExtraDataPart1,
klerosExtraDataPart2, gracePeriod, feeBps, tradeAmount, securityDepositPct,
securityDepositAmount, state, buyerSecurityDeposited, sellerSecurityDeposited,
fundsLocked, disputeCreated, disputer, disputeTimestamp, klerosDisputeID,
currentRuling, rulingReceivedTime, evidenceGroupID, confirmationTime,
buyerDepositTime, sellerDepositTime` — all `view`, caller `anyone`, no funds
movement. DENIED to nobody; nothing to protect but reads.

---

## 3. KlerosEscrowFactory + KlerosCourt

| Contract | Function         | ALLOWED     | DENIED               | State / note                     |
| -------- | ---------------- | ----------- | -------------------- | -------------------------------- |
| Factory  | `createEscrow`   | anyone      | —                    | permissionless clone deploy; pins buyer/seller/grace/amount/bps + immutable klerosCourt/extraData/treasury/feeBps |
| Factory  | `setPendingFee`  | owner       | everyone else        | two-step step 1; `feeBps <= MAX_FEE_BPS (10000)` |
| Factory  | `acceptFee`      | anyone      | —                    | two-step step 2, ≥1 day after setPendingFee (keeper-able) |
| Factory  | `setTreasury`    | owner       | everyone else        | previous treasury keeps control until step 2 |
| Factory  | `acceptTreasury` | newTreasury | owner + third parties| only the proposed treasury; prevents takeover |
| Factory  | 15 views         | anyone      | —                    | `token, klerosCourt, klerosExtraDataPart1/2, feeBps, treasury, implementation, owner, pendingFeeBps, feeChangePending, pendingTreasury, escrowCountByBuyer, escrowCountBySeller, escrowByBuyer, escrowBySeller` |
| Court    | 5 views          | anyone      | —                    | `arbitrationCost, appealCost, appealPeriod, disputeStatus, currentRuling` |
| Court    | `appeal`-adjacent funding | —    | —                    | Kleros Court mainnet `0x988b3a538b618C7A603e1c11Ab82Cd16dbE28069` |

## 4. RLS — table × role × command

Verified by `rls-policy.spec.ts`, which **replays the migration set in order**
(`rls-model.ts`) and asserts the final policy graph. Notation: `R` read /
`W` write; "claim" = `public.current_user_id()` (resolves JWT `wallet_address`
claim → `users.id`) or `auth.jwt()`.

| Table                     | anon R | anon W | authenticated R         | authenticated W                       |
| ------------------------- | ------ | ------ | ----------------------- | ------------------------------------- |
| `users`                   | ✅     | ❌     | ✅                     | self only (`wallet_address` claim)    |
| `offers`                  | ✅     | ❌     | ✅                     | owner (`seller_id` claim)             |
| `trades`                  | ❌     | ❌     | parties only            | parties only                          |
| `trade_events`            | ❌     | ❌     | parties (subquery)      | parties only                          |
| `conversations`           | ❌     | ❌     | participant             | participant                           |
| `conversation_participants`| ❌    | ❌     | participant             | self (insert/update/delete)           |
| `messages`                | ❌     | ❌     | participant             | insert: `sender_id` bound to claim + participant; update/delete own only |
| `message_attachments`     | ❌     | ❌     | participant             | own rows only                         |
| `notifications`           | ❌     | ❌     | own rows                | own rows only                         |
| `notification_preferences`| ❌     | ❌     | own rows                | own rows only                         |
| `disputes`                | ❌     | ❌     | parties only            | parties only                          |
| `dispute_evidence`        | ❌     | ❌     | parties only            | parties only                          |
| `trade_ratings`           | ✅     | ❌     | ✅                     | rater = claim AND trade membership    |
| `reputation_*` (4 tables) | ✅     | ❌     | ✅                     | via `increment_reputation_score` RPC only |
| `siwe_nonces`             | ❌     | ❌     | ❌ (zero policies)      | service-role only (RLS on, no policies) |
| `siwe_auth_links`         | ❌     | ❌     | ❌ (zero policies)      | service-role only (RLS on, no policies) |
| storage `avatars`         | ✅ R   | ❌     | ✅                     | owner-bound bucket path `{wlt}-{ts}.{ext}` |

Additional invariants asserted:
- **No `for all` policy survives** on any core table (aggregate grants banned).
- Every **write** policy references the claim; a literal `true` write policy is a
  hard failure ("never a bare true").
- `messages.sender_id` is bound to the claim on insert → **no message spoofing**.
- Legacy permissive policies (`*_any`, `*_all`, `avatars_anon_write`, …) are all
  dropped by the cutover migration.
- Every **latest** SECURITY DEFINER function pins `set search_path = public`:
  `current_user_id, is_conversation_participant,
  create_conversation_for_trade, bump_conversation_last_message,
  notify_conversation_message, increment_reputation_score`.
- `increment_reputation_score` rejects NULL `user_id` and hard-bounds `delta` to
  ±10 (P0), so the anon-callable reputation sink is closed.

## 5. Edge functions

Verified by `siwe-auth.spec.ts` + `send-email.spec.ts` against the shared pure
modules (`supabase/functions/_shared/*-core.ts`), which the edge functions
import directly.

### 5.1 siwe-auth (`/nonce`, `/verify`)
| Check | ALLOW | DENY |
| ----- | ----- | ---- |
| URI host allowlist | `coffernode.app`, `localhost`, `127.0.0.1` | any other origin (phishing SIWE) |
| Message shape | valid EIP-4361 header, 0x40 address line | non-SIWE header, missing/short/junk address |
| Required fields | `URI` `Version` `Nonce` `Issued At` present | any missing; malformed URI |
| Nonce TTL | fresh (≤5 min) | stale request |
| Nonce cap | ≤5 active per address | issuance refused beyond cap |
| Session | `wallet_address` claim, HS256, 24h TTL | craft without valid signature (viem verify upstream) |

### 5.2 send-email (`POST`)
| Check | ALLOW | DENY |
| ----- | ----- | ---- |
| Origin | `https://coffernode.app`, `localhost/127.0.0.1:5173` | every other origin (hotlinking the edge URL) |
| CR/LF injection | plain body/subject | any `\r`/`\n` in subject/body (collapsed + capped) |
| Size caps | subject ≤200, text ≤5000 | oversized payloads |
| Recipient directive | stored, plausibly an email (regex + ≤320) | injected separators, junk, blank |
| Rate limit | ≤2 per recipient/60s | the 3rd send in a window (resets after) |
| Payload contract | `{ user_id, subject, text }` only (address resolved server-side) | client-supplied `to`, `html`, CC fields |

## 6. Findings — residual gaps (this matrix's honest bottom line)

1. **⚠ LIVE posture is still permissive until the deploy.** Anon write
   policies are provably present pre-cutover; the target posture in §4 is
   certified only by the SQL. Gate §4 on the actual deploy (test as part of
   staging cutover).
2. **`rule`/`court` callback not .sol-verified in-repo** (`source: contract-doc`).
   No `contrats/` tree exists here; the ERC-792 `onlyKleros` + `InvalidRuling`
   revert are claims from docs, not an ABI-derived assertion. Move your `.sol`
   into a vendored dir and flip these to `abi`.
3. **`raiseDispute` non-party revert** is enforced on-chain only; the UI does not
   pre-block a third party (UX gap — safe on-chain, worth a client gate).
4. **B-1 phantom ABI entry** — `unlockAfterTimeout()` exists only in the
   deprecated `Escrow.sol`; delete the ABI entry (`src/lib/contracts.ts:139`).
5. **Server-enforced "kind"** for messages is not expressible in RLS alone; the
   `kind` field (system vs user) is still client-authorized. Follow the §todo
   item "Message writes server-enforced" for a definer-function gate.
6. **`increment_reputation_score` delta bound (±10)** is generous headroom vs
   the UI's ±2/3 — tighten to ±5 after analytics prove the distribution.

---

_Source of truth: `tests/security/escrow-matrix.ts` (matrix), `rls-model.ts`
(RLS simulator), the ABI/constants in `src/lib/contracts.ts`, and the migrations
under `supabase/migrations/`. Re-run `npm run test -- tests/security` after any
ABI/policy/gate change._