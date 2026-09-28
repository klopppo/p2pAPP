/**
 * Expected chain (where the factory is deployed), from Vite env. This is the
 * single source of truth for "which chain should the wallet be on?". Unset →
 * every wallet is treated as OK so dev environments without a deployment work.
 */
import { mainnet, sepolia } from 'wagmi/chains'
import type { Chain } from 'viem'

const envRaw = import.meta.env.VITE_EXPECTED_CHAIN_ID
const envParsed = envRaw != null && envRaw !== '' ? Number(envRaw) : NaN
export const expectedChainId: number | null =
  Number.isInteger(envParsed) && envParsed > 0 ? envParsed : null

const CHAIN_BY_ID: Record<number, Chain> = { [mainnet.id]: mainnet, [sepolia.id]: sepolia }

export const expectedChain: Chain | null =
  expectedChainId != null ? CHAIN_BY_ID[expectedChainId] ?? null : null

export const expectedChainLabel: string | null = expectedChain
  ? expectedChain.name
  : expectedChainId != null
    ? `chain ${expectedChainId}`
    : null

/** Compares against the wallet's current chain; unset/none → always match. */
export function isOnExpectedChain(walletChainId: number | undefined): boolean {
  if (expectedChainId == null) return true
  if (walletChainId == null) return true
  return walletChainId === expectedChainId
}
