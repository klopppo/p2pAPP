/**
 * Smart contract configuration — KlerosEsc + KlerosEscrowFactory.
 *
 * Rulings (NUMBER_OF_CHOICES = 4; `_ruling > 4` reverts):
 *   0 REFUSED · 1 AWARD_BUYER_PENALTY_SELLER · 2 AWARD_SELLER_PENALTY_BUYER
 *   3 AWARD_BUYER_RETURN_DEPOSITS · 4 AWARD_SELLER_RETURN_DEPOSITS
 *
 * State machine: AWAITING_FUNDING → FUNDED → CONFIRMED_PENDING →
 * AWAITING_RULING → RULING_RECEIVED → RULING_EXECUTED → COMPLETED;
 * any state may move to CANCELLED during funding.
 *
 * The on-chain escrow is the source of truth; the Supabase `disputes` row is a
 * mirror for fast querying and off-chain metadata (IPFS CIDs, attachments).
 */
import { parseAbi, type Abi } from 'viem'

/** Kleros v1/ERC-792 mainnet court pinned by the factory. */
export const KLEROS_COURT_MAINNET =
  '0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069' as `0x${string}`

/** Per-environment factory address (entry point for listing user escrows). */
export const KLEROS_ESCROW_FACTORY_ADDRESS = (
  import.meta.env.VITE_KLEROS_ESCROW_FACTORY?.trim() || ''
) as `0x${string}` | ''

/** KlerosEsc.NUMBER_OF_CHOICES — any ruling > this reverts with InvalidRuling. */
export const NUMBER_OF_CHOICES = 4n
/** KlerosEsc.DISPUTE_TIMEOUT = 30 days. */
export const DISPUTE_TIMEOUT_SECONDS = 30n * 24n * 60n * 60n
/** KlerosEsc.cancelTrade() TIMELOCK = 1 day. */
export const CANCEL_TIMELOCK_SECONDS = 1n * 24n * 60n * 60n
/** KlerosEsc.MAX_GRACE_PERIOD = 365 days. */
export const MAX_GRACE_PERIOD_SECONDS = 365n * 24n * 60n * 60n
/** KlerosEsc.MIN_SECURITY_DEPOSIT_BPS = 1% (must be ≥ this OR exactly 0). */
export const MIN_SECURITY_DEPOSIT_BPS = 100n
/** KlerosEsc.MAX_SECURITY_DEPOSIT_BPS = 15%. */
export const MAX_SECURITY_DEPOSIT_BPS = 1500n

/** Default slashable deposit fraction (10%). */
export const DEFAULT_SECURITY_DEPOSIT_BPS = 1000n
/** Fallback grace period when a caller doesn't supply one. */
export const DEFAULT_GRACE_PERIOD_SECONDS = 1n * 60n * 60n
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
export type KlerosEscStateValue = (typeof KlerosEscState)[keyof typeof KlerosEscState]

/** Ruling enum (matches KlerosEsc.Ruling). */
export const Ruling = {
  REFUSED: 0,
  AWARD_BUYER_PENALTY_SELLER: 1,
  AWARD_SELLER_PENALTY_BUYER: 2,
  AWARD_BUYER_RETURN_DEPOSITS: 3,
  AWARD_SELLER_RETURN_DEPOSITS: 4,
} as const

/** App-level severity (NOT on-chain) — maps to the form dropdown. */
export const SEVERITY_TO_APPLEVEL = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
} as const
export type SeverityLabel = keyof typeof SEVERITY_TO_APPLEVEL

/** Subset of KlerosEsc we call from the frontend. */
export const KLEROS_ESC_ABI = parseAbi([
  'function depositBuyerSecurityDeposit() external',
  'function depositSellerSecurityDeposit() external',
  'function lockFunds() external',
  'function confirm() external',
  'function release() external',
  'function cancelTrade() external',
  'function raiseDispute() external payable',
  'function submitEvidence(bytes32 _evidenceURI) external',
  'function appeal() external payable',
  'function rule(uint256 _disputeID, uint256 _ruling) external',
  'function executeRuling() external',
  'function finalize() external',
  'function timeoutDispute() external',
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
  'function buyerDepositTime() external view returns (uint256)',
  'function sellerDepositTime() external view returns (uint256)',
]) satisfies Abi

/** KlerosEscrowFactory: list/create escrows, two-step admin setters, events. */
export const KLEROS_ESCROW_FACTORY_ABI = parseAbi([
  'function createEscrow(address buyer, address seller, uint256 gracePeriod, uint256 tradeAmount, uint256 securityDepositPct) external returns (address)',
  // In the ABI so viem decodes the custom error instead of "signature not found".
  'error InvalidTreasury()',
  'function escrowCountByBuyer(address _party) external view returns (uint256)',
  'function escrowByBuyer(address _party, uint256 _index) external view returns (address)',
  'function escrowCountBySeller(address _party) external view returns (uint256)',
  'function escrowBySeller(address _party, uint256 _index) external view returns (address)',
  'function token() external view returns (address)',
  'function klerosCourt() external view returns (address)',
  'function klerosExtraDataPart1() external view returns (bytes32)',
  'function klerosExtraDataPart2() external view returns (bytes32)',
  'function feeBps() external view returns (uint256)',
  'function treasury() external view returns (address)',
  'function implementation() external view returns (address)',
  'function pendingFeeBps() external view returns (uint256)',
  'function feeChangePending() external view returns (bool)',
  'function setPendingFee(uint256 _feeBps) external',
  'function acceptFee() external',
  'function pendingTreasury() external view returns (address)',
  'function setTreasury(address _treasury) external',
  'function acceptTreasury() external',
  'function owner() external view returns (address)',
  // Without these, decodeEventLog throws AbiEventNotFoundError for factory logs.
  'event EscrowCreated(address indexed buyer, address indexed seller, address indexed creator, address escrowAddress, address escrowTreasury, uint256 gracePeriod, uint256 feeBps, uint256 tradeAmount, uint256 securityDepositPct)',
  'event KlerosEscrowConfigured(address indexed escrowAddress, address indexed klerosCourt, bytes32 klerosExtraDataPart1, bytes32 klerosExtraDataPart2)',
  'event FeeUpdated(uint256 newFeeBps)',
  'event PendingFeeSet(uint256 pendingFeeBps)',
  'event TreasuryUpdated(address newTreasury)',
  'event TreasuryChangeRequested(address indexed newTreasury)',
]) satisfies Abi

/** IKlerosCourt — ERC-792 subset for fee estimation / ruling reads. */
export const KLEROS_COURT_ABI = parseAbi([
  'function arbitrationCost(bytes _extraData) external view returns (uint256)',
  'function appealCost(uint256 _disputeID, bytes _extraData) external view returns (uint256)',
  'function appealPeriod(uint256 _disputeID) external view returns (uint256 start, uint256 end)',
  'function disputeStatus(uint256 _disputeID) external view returns (uint256)',
  'function currentRuling(uint256 _disputeID) external view returns (uint256)',
]) satisfies Abi

/** Every event emitted by KlerosEsc (typed for decodeEventLog/parseEventLogs). */
export const KLEROS_ESC_EVENTS_ABI = parseAbi([
  'event Initialized(address token, address buyer, address seller, address klerosCourt, bytes32 klerosExtraDataPart1, bytes32 klerosExtraDataPart2, address treasury, uint256 gracePeriod, uint256 feeBps, uint256 tradeAmount, uint256 securityDepositPct)',
  'event BuyerSecurityDeposited(address indexed buyer, uint256 amount)',
  'event SellerSecurityDeposited(address indexed seller, uint256 amount)',
  'event SellerFundsLocked(address indexed seller, uint256 totalAmount)',
  'event TradeFullyFunded()',
  'event TradeCancelled(address indexed canceller)',
  'event FundsReturned(address indexed party, uint256 amount)',
  'event Confirmed(uint256 confirmationTime)',
  'event Released(uint256 buyerAmount, uint256 feeAmount)',
  'event DisputeRaised(uint256 indexed klerosDisputeID, address indexed raiser, uint256 feePaid)',
  'event AppealFunded(uint256 indexed klerosDisputeID, address indexed appellant, uint256 feePaid)',
  'event RulingReceived(uint256 indexed klerosDisputeID, uint8 ruling)',
  'event RulingExecuted(uint256 indexed klerosDisputeID, uint8 ruling)',
  'event Finalized(uint256 indexed klerosDisputeID)',
  'event DisputeTimedOut(address indexed winner, bool indexed buyerWasDisputer)',
  'event MetaEvidence(uint256 indexed metaEvidenceID, address indexed arbitrator, bytes32 evidenceURI, bytes4 interfaceId)',
  'event Dispute(uint256 indexed disputeID, uint256 indexed metaEvidenceID, uint256 evidenceGroupID)',
  'event Evidence(uint256 indexed metaEvidenceID, address indexed party, bytes32 evidenceURI, uint256 evidenceGroupID)',
]) satisfies Abi

export function isFactoryConfigured(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(KLEROS_ESCROW_FACTORY_ADDRESS)
}

/**
 * Concatenate the two Kleros extraData parts into the single `bytes` the court
 * expects (ERC-792: subcourtId || minJurors).
 */
export function encodeKlerosExtraData(part1: `0x${string}`, part2: `0x${string}`): `0x${string}` {
  const p1 = part1.startsWith('0x') ? part1.slice(2) : part1
  const p2 = part2.startsWith('0x') ? part2.slice(2) : part2
  return `0x${p1}${p2}` as `0x${string}`
}

/** ERC-20 read + approve subset for the funding flow. */
export const ERC20_ABI = parseAbi([
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function balanceOf(address _owner) external view returns (uint256)',
  'function allowance(address _owner, address _spender) external view returns (uint256)',
  'function approve(address _spender, uint256 _value) external returns (bool)',
]) satisfies Abi
