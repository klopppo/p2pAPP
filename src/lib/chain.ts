/**
 * Reads the expected chain id (where the KlerosEscrowFactory is deployed)
 * from Vite env and exposes a comparison helper for the UI.
 *
 * Why: the wagmi config declares `chains: [mainnet, sepolia]` so a user can
 * be on either, but `writeContractAsync` against the factory's address
 * will revert with no useful copy when the wallet is on the wrong one.
 * This module is the single source of truth for "which chain should the
 * wallet be on?" — ChainGuard reads it, the navbar banner reads it, and the
 * write-catch blocks can test against `expectedChainId`.
 *
 * Set in .env:
 *   VITE_EXPECTED_CHAIN_ID=1     # Ethereum mainnet
 *   VITE_EXPECTED_CHAIN_ID=11155111  # Sepolia
 *
 * If unset, the helper returns null and ChainGuard treats the user as
 * always-connected-OK (so dev environments without a specific deployment
 * still work).
 */

import { mainnet, sepolia } from 'wagmi/chains'
import type { Chain } from 'viem'

const envRaw = import.meta.env.VITE_EXPECTED_CHAIN_ID
const envParsed = envRaw != null && envRaw !== '' ? Number(envRaw) : NaN
export const expectedChainId: number | null =
  Number.isFinite(envParsed) && envParsed > 0 ? envParsed : null

const CHAIN_BY_ID: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
}

/** Resolve the wagmi chain descriptor for the expected chain id.
 *  Returns null when (a) expectedChainId is unset or (b) the configured
 *  id isn't part of wagmi's default chain list. */
export const expectedChain: Chain | null =
  expectedChainId != null ? (CHAIN_BY_ID[expectedChainId] ?? null) : null

/** Short human label for the chain, falling back to the numeric id when
 *  the chain isn't recognised (custom networks, etc.). */
export const expectedChainLabel: string | null = expectedChain
  ? expectedChain.name
  : expectedChainId != null
    ? `chain ${expectedChainId}`
    : null

/** Helper for the call sites that compare against the wallet's current
 *  chain. Treats unset as 'always match' so dev environments without a
 *  pinned chain don't block the user. */
export function isOnExpectedChain(walletChainId: number | undefined): boolean {
  if (expectedChainId == null) return true
  if (walletChainId == null) return true
  return walletChainId === expectedChainId
}
