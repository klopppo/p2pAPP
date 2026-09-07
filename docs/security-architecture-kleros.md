# Kleros Escrow & End-to-End Security Architecture

This document outlines the authoritative technical specification, Kleros integration updates, escrow state machine, and security invariants for the CofferNode P2P exchange platform.

---

## 1. Core Architecture: KlerosEsc & Factory

Each P2P trade instantiates an isolated, non-custodial escrow contract via EIP-1167 minimal proxy cloning from `KlerosEscrowFactory`.

### Immutable Factory Pinned Parameters
At deployment (`createEscrow`), the factory binds immutable parameters to each clone:
- **Token Address (`token`)**: The ERC-20 token used for trade collateral and escrow.
- **Kleros Court (`klerosCourt`)**: ERC-792 arbitrator court address (e.g., Mainnet Kleros Court).
- **ExtraData (`klerosExtraDataPart1`, `klerosExtraDataPart2`)**: Encoded arbitration parameters (arbitrator extra data + decentralized court subcourt/juror requirements).
- **Treasury Address (`treasury`)**: Platform fee recipient.

---

## 2. Dispute State Machine & Rulings

### Escrow State Machine (`KlerosEsc.State`)
1. `AWAITING_FUNDING` (0) — Escrow deployed; awaiting security deposits & token funding.
2. `FUNDED` (1) — Both parties deposited security funds and trade amount is locked.
3. `CONFIRMED_PENDING` (2) — Fiat confirmed off-chain; release pending or timeout.
4. `AWAITING_RULING` (3) — Dispute raised; waiting for Kleros Court arbitration.
5. `RULING_RECEIVED` (4) — Arbitrator ruling delivered via `rule()`.
6. `RULING_EXECUTED` (5) — Ruling executed, funds distributed.
7. `COMPLETED` (6) — Trade finalized successfully.
8. `CANCELLED` (7) — Mutual cancel during funding phase.

### Rulings & Outcomes (`NUMBER_OF_CHOICES = 4`)
- **0 = REFUSED** (Auto-cancel): Crypto returned to seller; security deposits returned.
- **1 = AWARD_BUYER_PENALTY_SELLER**: Buyer wins; seller's security deposit slashed.
- **2 = AWARD_SELLER_PENALTY_BUYER**: Seller wins; buyer's security deposit slashed.
- **3 = AWARD_BUYER_RETURN_DEPOSITS**: Buyer wins; both security deposits returned.
- **4 = AWARD_SELLER_RETURN_DEPOSITS**: Seller wins; both security deposits returned.

---

## 3. End-to-End Trade & Escrow Flow

1. **Offer Creation:**
   - Maker creates public or private offer (`is_private`, `target_user`).
   - RLS restricts private offers exclusively to the seller and the pinned target wallet.
2. **Trade Initiation:**
   - Taker accepts offer, triggering `KlerosEscrowFactory.createEscrow(...)`.
   - Trade metadata and immutable escrow addresses are mirrored into Supabase.
3. **Funding & Deposits:**
   - Seller funds trade amount + security deposit.
   - Buyer funds security deposit.
4. **Fiat Payment & Release:**
   - Buyer pays fiat off-chain and calls `confirm()`.
   - Seller releases crypto via `release()`, completing the trade.
5. **Dispute & Evidence (ERC-1497):**
   - If a dispute arises, either party calls `raiseDispute()`.
   - Evidence is uploaded to IPFS, hashed to `bytes32` (`cidToBytes32`), and submitted via `submitEvidence()`.
   - Kleros Court arbitrators review evidence and rule.

---

## 4. Database Security (Supabase RLS & SIWE P1)

- **Fail-Closed Default:** Row-Level Security (RLS) is enabled on all tables; anon users have zero write permissions.
- **JWT Wallet Binding:** All write policies enforce `current_user_id()`, mapping the SIWE JWT `wallet_address` custom claim to `public.users.id`.
- **Participant-Scoped Trades & Chat:** Trades, chat conversations, messages, and disputes are strictly restricted to authorized participants.
