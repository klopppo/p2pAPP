/**
 * Single source of truth for "fully signed in": a connected wallet AND a live
 * Supabase JWT for it (the SIWE challenge binds the session to the wallet; a
 * connected wallet alone proves nothing to RLS).
 */
import { useAccount } from 'wagmi'
import { useWalletSession } from './useWalletSession'
import { hasRejectedMarker, hasSignedInMarker } from './siweMarker'

export function useSignedInStatus() {
  const { address, isConnected } = useAccount()
  const { sessionWallet, hasSession, isLoading: userLoading } = useWalletSession()

  const lowerAddr = address?.toLowerCase() ?? null
  // Check the ACTIVE wallet's rejection key directly — scanning for the first
  // `declined:` key would return an unrelated wallet.
  const hasSuccessMarker = lowerAddr != null && hasSignedInMarker(lowerAddr)
  const hasRejectionMarker = hasRejectedMarker(lowerAddr)
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
    /** Connected at the wallet layer but SIWE not yet confirmed. */
    needsSignature: isConnected && !isFullySignedIn,
  }
}
