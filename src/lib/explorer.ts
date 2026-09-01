/**
 * Resolve the right block-explorer base URL for the current chain.
 *
 * `blockscan.com` is a multi-chain explorer (works for any EVM chain) — we
 * default to it because it's a safe fallback that always 200s even if
 * `VITE_EXPECTED_CHAIN_ID` is set to a chain the helper doesn't know about.
 *
 * `etherscan.io` only resolves hashes on Ethereum mainnet. For Sepolia (the
 * team's default dev chain) and any other testnet we route to
 * `sepolia.etherscan.io` so deep-links actually open a real chain page
 * rather than the mainnet 404 that a hardcoded `etherscan.io` produces.
 */
import { mainnet, sepolia } from 'wagmi/chains'
import { expectedChainId } from './chain'

const FALLBACK_BASE = 'https://blockscan.com'

const PER_CHAIN: Record<number, { address: string; tx: string; token: string }> = {
  [mainnet.id]: {
    address: 'https://etherscan.io/address/',
    tx: 'https://etherscan.io/tx/',
    token: 'https://etherscan.io/token/',
  },
  [sepolia.id]: {
    address: 'https://sepolia.etherscan.io/address/',
    tx: 'https://sepolia.etherscan.io/tx/',
    token: 'https://sepolia.etherscan.io/token/',
  },
}

function pickBase(): { address: string; tx: string; token: string } {
  const id = expectedChainId
  if (id != null) {
    const match = PER_CHAIN[id]
    if (match) return match
  }
  // Unknown chain or no env var: use blockscan.com which handles any EVM.
  return {
    address: `${FALLBACK_BASE}/address/`,
    tx: `${FALLBACK_BASE}/tx/`,
    token: `${FALLBACK_BASE}/token/`,
  }
}

export const explorerBase = pickBase()
