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
import { hasRejectedMarker, hasSignedInMarker } from './siweMarker'

export function useSignedInStatus() {
  const { address, isConnected } = useAccount()
  const { sessionWallet, hasSession, isLoading: userLoading } = useWalletSession()

  const lowerAddr = address?.toLowerCase() ?? null
  const hasSuccessMarker = lowerAddr != null && hasSignedInMarker(lowerAddr)
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
