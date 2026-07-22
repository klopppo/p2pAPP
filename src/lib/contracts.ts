/**
 * Smart contract configuration.
 *
 * The dispute creation flow writes to two places:
 *   1. The dispute contract on-chain (immutable, indexed by `disputeId`).
 *   2. The Supabase `disputes` table (queryable, joined with trades/users).
 *
 * The DB row carries the on-chain `tx_hash` + `disputeId` so the detail viewer
 * can deep-link to Etherscan and the two stores can be reconciled.
 *
 * NOTE: ABI below is the *expected* interface. Replace with the ABI emitted by
 * the deployed contract before shipping to mainnet — events and field orders
 * MUST match. Use `cast interface <Contract.sol>` or the block explorer to
 * regenerate the JSON ABI and translate into `parseAbi` items.
 */
import { parseAbi, toBytes, keccak256, type Abi } from 'viem'

/**
 * Address is sourced from `VITE_DISPUTE_CONTRACT_ADDRESS`. When unset, contract
 * calls short-circuit with a clear error so the page renders instead of
 * throwing a `viem` `AddressRequiredError` deep in the call stack.
 *
 * Expected network is whatever the wagmi `config` is set to (currently mainnet
 * + sepolia — `src/wagmi.ts`). On sepolia the contract should be deployed at a
 * specific test address; on mainnet the production address.
 */
export const DISPUTE_CONTRACT_ADDRESS = (
  import.meta.env.VITE_DISPUTE_CONTRACT_ADDRESS?.trim() || ''
) as `0x${string}` | ''

/**
 * Severity mapping shared by the form (full text) and the contract (uint8).
 * Keep in lockstep with `SEVERITY` arrays in `DisputePage`.
 */
export const SEVERITY_TO_UINT8 = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
} as const

export type SeverityLabel = keyof typeof SEVERITY_TO_UINT8

/**
 * ABI for the dispute contract.
 *
 * Expected interface (pseudo-Solidity):
 *
 *   event DisputeCreated(
 *       uint256 indexed disputeId,
 *       bytes32 indexed tradeId,
 *       address indexed filer,
 *       string  evidenceCid,
 *       uint8   severity,
 *       uint256 timestamp
 *   );
 *
 *   function createDispute(
 *       bytes32 tradeId,        // packed trade uuid / on-chain trade key
 *       string  evidenceCid,   // IPFS CID (image)
 *       uint8   severity       // 0=Low, 1=Medium, 2=High, 3=Critical
 *   ) external returns (uint256 disputeId);
 *
 *   function disputes(uint256 disputeId) external view returns (
 *       bytes32 tradeId,
 *       address filer,
 *       address respondent,
 *       string  evidenceCid,
 *       uint8   severity,
 *       uint8   status,        // 0=Open, 1=InReview, 2=Resolved, 3=Escalated, 4=Closed
 *       uint256 createdAt,
 *       uint256 resolvedAt
 *   );
 */
export const DISPUTE_CONTRACT_ABI = parseAbi([
  // Writes
  'function createDispute(bytes32 tradeId, string evidenceCid, uint8 severity) external returns (uint256 disputeId)',
  // Reads
  'function disputes(uint256 disputeId) external view returns (bytes32 tradeId, address filer, address respondent, string evidenceCid, uint8 severity, uint8 status, uint256 createdAt, uint256 resolvedAt)',
  // Events
  'event DisputeCreated(uint256 indexed disputeId, bytes32 indexed tradeId, address indexed filer, string evidenceCid, uint8 severity, uint256 timestamp)',
]) satisfies Abi

/** True when an env-configured contract address is present. */
export function isDisputeContractConfigured(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(DISPUTE_CONTRACT_ADDRESS)
}

/**
 * Pack a trade id string into the `bytes32` the contract expects. We hash
 * with keccak256 so arbitrary-length trade ids round-trip deterministically
 * and short / non-hex ids don't collide via naive zero-padding.
 */
export function tradeIdToBytes32(tradeId: string): `0x${string}` {
  return keccak256(toBytes(tradeId))
}
