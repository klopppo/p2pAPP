/**
 * Smart contract configuration — KlerosEsc + KlerosEscrowFactory.
 *
 * The dispute flow has two layers:
 *
 *   1. Per-trade escrow (KlerosEsc clone, EIP-1167 minimal proxy)
 *      - Deployed by KlerosEscrowFactory.createEscrow(buyer, seller, grace, amount, depBps)
 *      - Holds the seller's crypto + optional security deposits
 *      - Routes disputes to a Kleros Court via ERC-792
 *
 *   2. Kleros Court (production: 0x988b3a538b618C7A603e1c11Ab82Cd16dbE28069, mainnet)
 *      - Off-chain arbitrators rule each dispute round
 *      - Calls back into the escrow via rule(_disputeID, _ruling)
 *
 * Rulings (NUMBER_OF_CHOICES = 4; `_ruling > 4` reverts):
 *   0 = REFUSED                   → auto-cancel: crypto → seller, deposits back
 *   1 = AWARD_BUYER_PENALTY_SELLER   → buyer + seller's deposit; nothing to seller
 *   2 = AWARD_SELLER_PENALTY_BUYER   → seller + buyer's deposit; nothing to buyer
 *   3 = AWARD_BUYER_RETURN_DEPOSITS   → buyer (minus fee); both deposits back
 *   4 = AWARD_SELLER_RETURN_DEPOSITS  → seller; both deposits back
 *
 * Dispute state machine (KlerosEsc.State):
 *   AWAITING_FUNDING (0) → FUNDED (1) → CONFIRMED_PENDING (2)
 *      → AWAITING_RULING (3) → RULING_RECEIVED (4) → RULING_EXECUTED (5)
 *      → COMPLETED (6)
 *   Any state may transition to CANCELLED (7) during funding.
 *
 * ERC-1497 evidence: buyer/seller submit evidence via submitEvidence(bytes32
 * _evidenceURI) where the URI is a content-addressed pointer to an off-chain
 * bundle (e.g. an IPFS CID). The Kleros frontend reads the URI from the
 * emitted `Evidence` event.
 *
 * NOTE: The on-chain escrow is the source of truth. The Supabase `disputes`
 * row is a mirror for fast querying and to store IPFS CIDs / on-chain metadata
 * that doesn't fit on-chain (free-text descriptions, multi-image attachments).
 */
import { parseAbi, keccak256, toBytes, type Abi } from 'viem'

// ─── Kleros Court address ────────────────────────────────────────────────────
// ERC-792 / Kleros v1 mainnet court. Disputes from every escrow deployed by
// the factory go here (the factory pins this address at construction).
export const KLEROS_COURT_MAINNET =
  '0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069' as `0x${string}`

// ─── KlerosEscrowFactory address ──────────────────────────────────────────────
// Each environment (mainnet, sepolia, local) deploys its own factory. The
// factory's address is the entry point for listing the user's escrows via
// the paginated `escrowByBuyer / escrowBySeller` getters.
export const KLEROS_ESCROW_FACTORY_ADDRESS = (
  import.meta.env.VITE_KLEROS_ESCROW_FACTORY?.trim() || ''
) as `0x${string}` | ''

// ─── Protocol constants from contracts/Constants.sol ─────────────────────────
/** KlerosEsc.NUMBER_OF_CHOICES — any ruling > this reverts with InvalidRuling. */
export const NUMBER_OF_CHOICES = 4n
/** KlerosEsc.DISPUTE_STATUS_SOLVED — Kleros v1 DisputeStatus.Solved. */
export const DISPUTE_STATUS_SOLVED = 2n
/** KlerosEsc.DISPUTE_TIMEOUT = 30 days — anyone can timeoutDispute() after. */
export const DISPUTE_TIMEOUT_SECONDS = 30n * 24n * 60n * 60n
/** KlerosEsc.MAX_GRACE_PERIOD = 365 days — passed to factory.createEscrow(). */
export const MAX_GRACE_PERIOD_SECONDS = 365n * 24n * 60n * 60n
/** KlerosEsc.MIN_SECURITY_DEPOSIT_BPS = 1% — must be ≥ this OR exactly 0. */
export const MIN_SECURITY_DEPOSIT_BPS = 100n
/** KlerosEsc.MAX_SECURITY_DEPOSIT_BPS = 15%. */
export const MAX_SECURITY_DEPOSIT_BPS = 1500n

// ─── App-level trade defaults ─────────────────────────────────────────────────
// These aren't on-chain yet — offer/trade schemas don't carry them. Hardcode
// reasonable defaults; the actual values should eventually come from the
// offer row (`security_deposit_pct`, `grace_period`) once those columns exist.

/** Buyer/seller each post this fraction of `tradeAmount` as a slashable
 *  security deposit. 10% = 1000 bps (within MIN..MAX bound). */
export const DEFAULT_SECURITY_DEPOSIT_BPS = 1000n
/** Buyer confirms off-chain fiat; this is how long after `confirm()` anyone
 *  may call `release()` without a dispute. 7 days. */
export const DEFAULT_GRACE_PERIOD_SECONDS = 7n * 24n * 60n * 60n
/** KlerosDisputeStatus enum (matches IKlerosCourt / KlerosCourt). */
export const KLEROS_DISPUTE_STATUS = {
  WAITING: 0n,
  APPEALABLE: 1n,
  SOLVED: 2n,
} as const
/** KlerosEsc.State enum (uint8). */
export const KlerosEscState = {
  AWAITING_FUNDING: 0,
  FUNDED: 1,
  CONFIRMED_PENDING: 2,
  AWAITING_RULING: 3,
  RULING_RECEIVED: 4,
  RULING_EXECUTED: 5,
  COMPLETED: 6,
  CANCELLED: 7,
} as const
export type KlerosEscStateValue =
  (typeof KlerosEscState)[keyof typeof KlerosEscState]

/** Ruling enum (matches KlerosEsc.Ruling). uint8 sent on-chain, not a severity. */
export const Ruling = {
  REFUSED: 0,
  AWARD_BUYER_PENALTY_SELLER: 1,
  AWARD_SELLER_PENALTY_BUYER: 2,
  AWARD_BUYER_RETURN_DEPOSITS: 3,
  AWARD_SELLER_RETURN_DEPOSITS: 4,
} as const
export type RulingValue = (typeof Ruling)[keyof typeof Ruling]

export const RULING_LABEL: Record<RulingValue, string> = {
  [Ruling.REFUSED]: 'Refused (auto-cancel)',
  [Ruling.AWARD_BUYER_PENALTY_SELLER]: 'Buyer wins, seller deposit slashed',
  [Ruling.AWARD_SELLER_PENALTY_BUYER]: 'Seller wins, buyer deposit slashed',
  [Ruling.AWARD_BUYER_RETURN_DEPOSITS]: 'Buyer wins, deposits returned',
  [Ruling.AWARD_SELLER_RETURN_DEPOSITS]: 'Seller wins, deposits returned',
}

/** App-level severity (NOT on-chain). Maps to the form's Low/Medium/High/Critical
 *  dropdown. Stored in Supabase for filtering; Kleros doesn't have severity. */
export const SEVERITY_TO_APPLEVEL = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
} as const
export type SeverityLabel = keyof typeof SEVERITY_TO_APPLEVEL

// ─── ABIs ────────────────────────────────────────────────────────────────────

/** Subset of KlerosEsc we actually call from the frontend. */
export const KLEROS_ESC_ABI = parseAbi([
  // Funding + post-funding
  'function depositBuyerSecurityDeposit() external',
  'function depositSellerSecurityDeposit() external',
  'function lockFunds() external',
  'function confirm() external',
  'function release() external',
  'function cancelTrade() external',
  'function unlockAfterTimeout() external',

  // Dispute flow
  'function raiseDispute() external payable',
  'function submitEvidence(bytes32 _evidenceURI) external',
  'function appeal() external payable',
  'function rule(uint256 _disputeID, uint256 _ruling) external',
  'function executeRuling() external',
  'function finalize() external',
  'function timeoutDispute() external',

  // Views: escrow identity
  'function token() external view returns (address)',
  'function buyer() external view returns (address)',
  'function seller() external view returns (address)',
  'function treasury() external view returns (address)',
  'function klerosCourt() external view returns (address)',
  'function klerosExtraDataPart1() external view returns (bytes32)',
  'function klerosExtraDataPart2() external view returns (bytes32)',
  'function gracePeriod() external view returns (uint256)',
  'function feeBps() external view returns (uint256)',
  'function tradeAmount() external view returns (uint256)',
  'function securityDepositPct() external view returns (uint256)',
  'function securityDepositAmount() external view returns (uint256)',

  // Views: escrow state machine
  'function state() external view returns (uint8)',
  'function buyerSecurityDeposited() external view returns (bool)',
  'function sellerSecurityDeposited() external view returns (bool)',
  'function fundsLocked() external view returns (bool)',
  'function disputeCreated() external view returns (bool)',
  'function disputer() external view returns (address)',
  'function disputeTimestamp() external view returns (uint256)',
  'function klerosDisputeID() external view returns (uint256)',
  'function currentRuling() external view returns (uint256)',
  'function rulingReceivedTime() external view returns (uint256)',
  'function evidenceGroupID() external view returns (uint256)',
  'function confirmationTime() external view returns (uint256)',
]) satisfies Abi

/** KlerosEscrowFactory: list user's escrows + create new ones. */
export const KLEROS_ESCROW_FACTORY_ABI = parseAbi([
  'function createEscrow(address buyer, address seller, uint256 gracePeriod, uint256 tradeAmount, uint256 securityDepositPct) external returns (address)',
  'function escrowCountByBuyer(address _party) external view returns (uint256)',
  'function escrowByBuyer(address _party, uint256 _index) external view returns (address)',
  'function escrowCountBySeller(address _party) external view returns (uint256)',
  'function escrowBySeller(address _party, uint256 _index) external view returns (address)',
  // Pinned configuration (immutable in the contract).
  'function token() external view returns (address)',
  'function klerosCourt() external view returns (address)',
  'function klerosExtraDataPart1() external view returns (bytes32)',
  'function klerosExtraDataPart2() external view returns (bytes32)',
  'function feeBps() external view returns (uint256)',
  'function treasury() external view returns (address)',
  'function implementation() external view returns (address)',
]) satisfies Abi

/** IKlerosCourt — ERC-792 subset used for fee estimation and (optionally)
 *  reading the live ruling/appeal period without going through the escrow. */
export const KLEROS_COURT_ABI = parseAbi([
  'function arbitrationCost(bytes _extraData) external view returns (uint256)',
  'function appealCost(uint256 _disputeID, bytes _extraData) external view returns (uint256)',
  'function appealPeriod(uint256 _disputeID) external view returns (uint256 start, uint256 end)',
  'function disputeStatus(uint256 _disputeID) external view returns (uint256)',
  'function currentRuling(uint256 _disputeID) external view returns (uint256)',
]) satisfies Abi

// ─── Events (typed for viem's decodeEventLog / parseEventLogs) ───────────────
// Re-declared here so the frontend can decode receipts/logs without depending
// on the on-chain ABI elsewhere.

export const KLEROS_ESC_EVENTS_ABI = parseAbi([
  'event MetaEvidence(uint256 indexed metaEvidenceID, address indexed arbitrator, bytes32 evidenceURI, bytes4 interfaceId)',
  'event Dispute(uint256 indexed disputeID, uint256 indexed metaEvidenceID, uint256 evidenceGroupID)',
  'event Evidence(uint256 indexed metaEvidenceID, address indexed party, bytes32 evidenceURI, uint256 evidenceGroupID)',
  'event DisputeRaised(uint256 indexed klerosDisputeID, address indexed raiser, uint256 feePaid)',
  'event RulingReceived(uint256 indexed klerosDisputeID, uint8 ruling)',
  'event RulingExecuted(uint256 indexed klerosDisputeID, uint8 ruling)',
  'event Finalized(uint256 indexed klerosDisputeID)',
  'event DisputeTimedOut(address indexed winner, bool indexed buyerWasDisputer)',
  'event AppealFunded(uint256 indexed klerosDisputeID, address indexed appellant, uint256 feePaid)',
]) satisfies Abi

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isFactoryConfigured(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(KLEROS_ESCROW_FACTORY_ADDRESS)
}

/**
 * Pack a trade key (UUID / VARCHAR) into the 32-byte representation Kleros
 * expects in extraData. Mirrors the keccak-based packing we used for the
 * placeholder contract; Kleros itself doesn't care about the content (it
 * only stores the bytes and threads them back via `rule(_disputeID, _ruling)`),
 * but we need a deterministic, in-bounds value.
 */
export function tradeKeyToBytes32(tradeKey: string): `0x${string}` {
  return keccak256(toBytes(tradeKey))
}

/**
 * Encode the two Kleros extraData parts into the single `bytes` the court
 * expects (per ERC-792: bytes 0..32 subcourtId, bytes 32..64 minJurors).
 * The factory stores them as two bytes32 already-packed fields; this helper
 * concatenates them so callers can pass directly to `arbitrationCost(bytes)`.
 */
export function encodeKlerosExtraData(
  part1: `0x${string}`,
  part2: `0x${string}`,
): `0x${string}` {
  // Strip 0x prefix from each 32-byte word, concat, re-prefix.
  const p1 = part1.startsWith('0x') ? part1.slice(2) : part1
  const p2 = part2.startsWith('0x') ? part2.slice(2) : part2
  return `0x${p1}${p2}` as `0x${string}`
}

/** Map an on-chain `state` uint8 → human label. */
export const KlerosEscStateLabel: Record<KlerosEscStateValue, string> = {
  [KlerosEscState.AWAITING_FUNDING]: 'Awaiting funding',
  [KlerosEscState.FUNDED]: 'Funded',
  [KlerosEscState.CONFIRMED_PENDING]: 'Confirmed (release pending)',
  [KlerosEscState.AWAITING_RULING]: 'Awaiting Kleros ruling',
  [KlerosEscState.RULING_RECEIVED]: 'Ruling received',
  [KlerosEscState.RULING_EXECUTED]: 'Ruling executed',
  [KlerosEscState.COMPLETED]: 'Completed',
  [KlerosEscState.CANCELLED]: 'Cancelled',
}

// ─── ERC-20 helpers (minimal ABI subset for the funding flow) ────────────────

/** ERC-20 read + approve subset. Used by TradeDetailPage to display the
 *  trade token and to let the user approve the escrow to pull funds. */
export const ERC20_ABI = parseAbi([
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function balanceOf(address _owner) external view returns (uint256)',
  'function allowance(address _owner, address _spender) external view returns (uint256)',
  'function approve(address _spender, uint256 _value) external returns (bool)',
]) satisfies Abi