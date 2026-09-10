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
import { useCurrentUser } from './useCurrentUser'

const SUCCESS_KEY = 'coffernode:siwe:last'
const REJECTED_KEY_PREFIX = 'coffernode:siwe:declined:'

function readStored(): {
  signedAddress: string | null
  rejectedAddress: string | null
} {
  if (typeof window === 'undefined') {
    return { signedAddress: null, rejectedAddress: null }
  }
  let signedAddress: string | null = null
  let rejectedAddress: string | null = null
  try {
    const raw = window.localStorage.getItem(SUCCESS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { address?: string }
      if (typeof parsed.address === 'string') {
        signedAddress = parsed.address.toLowerCase()
      }
    }
  } catch {
    /* ignore */
  }
  // Look for any rejection marker — the active wallet (if any) matches
  // when its key is set.
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (k && k.startsWith(REJECTED_KEY_PREFIX)) {
      rejectedAddress = k.slice(REJECTED_KEY_PREFIX.length).toLowerCase()
      break
    }
  }
  return { signedAddress, rejectedAddress }
}

export function useSignedInStatus() {
  const { address, isConnected } = useAccount()
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()

  // Read the persisted marker once per render. Cheap (a couple of
  // localStorage gets) — no need to memoise.
  const { signedAddress, rejectedAddress } = readStored()

  const lowerAddr = address?.toLowerCase() ?? null
  const hasSuccessMarker = signedAddress != null && signedAddress === lowerAddr
  const hasRejectionMarker =
    lowerAddr != null && rejectedAddress === lowerAddr

  // The Supabase `users` row must exist for the connected wallet —
  // confirms the backend processed the SIWE verify + upsert.
  const userOk =
    !!currentUser?.wallet_address &&
    !!lowerAddr &&
    currentUser.wallet_address.toLowerCase() === lowerAddr

  const isFullySignedIn =
    isConnected && hasSuccessMarker && userOk && !hasRejectionMarker

  return {
    address: lowerAddr,
    isConnected,
    isFullySignedIn,
    hasSuccessMarker,
    hasRejectionMarker,
    userLoading,
    /** True when the user is connected at the wallet layer but hasn't
     *  completed the SIWE challenge yet (or the backend hasn't confirmed). */
    needsSignature: isConnected && !isFullySignedIn,
  }
}
