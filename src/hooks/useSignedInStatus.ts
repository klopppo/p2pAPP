/**
 * Single source of truth for "the user is fully signed in to CofferNode".
 *
 * "Fully signed in" means ALL of:
 *   1. wagmi reports a connected wallet
 *   2. the wallet address matches a non-rejected SIWE marker on this device
 *
 * A wallet alone isn't enough — the SIWE challenge is what binds the
 * Supabase auth session to the wallet. Without it, page-level
 * useCurrentUser queries fall through to the JWT-decode path that returns
 * null, and writes fail RLS. So the top-nav "connected" affordances
 * (account dropdown, signed-in nav links, etc.) must require BOTH.
 *
 * Used by:
 *   - SiweGate           to decide whether to mount the sign-in modal
 *   - Navbar            to flip the "Connect wallet" / account dropdown
 *   - WalletConnectButton to mirror the same state
 */
import { useAccount } from 'wagmi'
import { useWalletSession } from './useWalletSession'

const SUCCESS_KEY = 'coffernode:siwe:last'
const REJECTED_KEY_PREFIX = 'coffernode:siwe:declined:'

function readStored(): {
  signedAddress: string | null
} {
  if (typeof window === 'undefined') {
    return { signedAddress: null }
  }
  let signedAddress: string | null = null
  try {
    const raw = window.localStorage.getItem(SUCCESS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { address?: string }
      if (typeof parsed.address === 'string') {
        return parsed.address.toLowerCase()
      }
    }
  } catch {
    /* ignore */
  }
  return { signedAddress }
}

/** Whether the given wallet has a persisted "declined sign-in" marker. */
function hasRejectedMarker(addr: string | null): boolean {
  if (typeof window === 'undefined' || !addr) return false
  return window.localStorage.getItem(`${REJECTED_KEY_PREFIX}${addr.toLowerCase()}`) === '1'
}

export function useSignedInStatus() {
  const { address, isConnected } = useAccount()
  const { sessionWallet, hasSession, isLoading: userLoading } = useWalletSession()

  // Read the persisted marker once per render. Cheap (a couple of
  // localStorage gets) — no need to memoise.
  const { signedAddress } = readStored()

  const lowerAddr = address?.toLowerCase() ?? null
  const hasSuccessMarker = signedAddress != null && signedAddress === lowerAddr
  // Check the ACTIVE wallet's key directly — scanning for the first
  // `declined:` key returns an unrelated wallet when several were rejected.
  const hasRejectionMarker = hasRejectedMarker(lowerAddr)

  // The live Supabase JWT is the source of truth: a connected wallet plus a
  // world-readable `users` row proves nothing to RLS, which authorizes off the
  // `wallet_address` claim. A live session also supersedes a stale rejection
  // marker (which only exists to stop us re-prompting MetaMask).
  const isFullySignedIn = isConnected && hasSession

  return {
    address: lowerAddr,
    isConnected,
    isFullySignedIn,
    hasSuccessMarker,
    hasLiveSession: hasSession,
    sessionWallet,
    hasRejectionMarker,
    userLoading,
    /** True when the user is connected at the wallet layer but hasn't
     *  completed the SIWE challenge yet (or the backend hasn't confirmed). */
    needsSignature: isConnected && !isFullySignedIn,
  }
}
