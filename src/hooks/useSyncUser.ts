import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { clearPersistedQueryCache } from '@/lib/queryPersister'
import { ensureWalletSession, recoverWalletSession, signOut, claimReferral } from '@/lib/supabase'
import { signWalletMessage } from '@/lib/walletSigner'
import { consumePendingReferral, isValidReferralCode } from '@/lib/referral'
import { hasSignedInMarker } from './siweMarker'

/**
 * Keeps the Supabase `users` row in sync with the connected wallet.
 *
 * Race fix: `tokenRef` is bumped on every wallet state change; async callbacks
 * capture it and drop their result if it no longer matches, so a stale sign-in
 * can't overwrite a newer wallet's session.
 */
export function useSyncUser() {
  const { address, isConnected } = useAccount()
  const syncedAddress = useRef<string | null>(null)
  const redirectedAddress = useRef<string | null>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const tokenRef = useRef(0)
  // Distinguishes a real disconnect from the initial not-yet-reconnected mount
  // (wagmi reports `isConnected: false` before restoring the session).
  const wasConnectedRef = useRef(false)

  // After a wallet disconnect (including via RainbowKit's modal) go back to
  // the marketplace.
  useEffect(() => {
    if (isConnected) {
      wasConnectedRef.current = true
      return
    }
    if (!wasConnectedRef.current) return
    wasConnectedRef.current = false
    navigate('/app/offers')
  }, [isConnected, navigate])

  useEffect(() => {
    const myToken = ++tokenRef.current

    if (!isConnected || !address) {
      // Bump the token first so an in-flight ensureWalletSession from the
      // previous connect is ignored, then tear down session + caches.
      const prev = syncedAddress.current
      syncedAddress.current = null
      if (prev) {
        // Drop the in-memory cache too: the persister re-attaches with the
        // anonymous buster after disconnect, so leaving wallet-scoped data
        // resident would re-persist it and hydrate it for the next anon visit.
        void qc.cancelQueries()
        qc.clear()
        clearPersistedQueryCache()
        void signOut().catch((err) => {
          console.warn('[useSyncUser] signOut on wallet disconnect failed:', err)
        })
      }
      return
    }

    // Skip redundant sign-ins for an address already synced this session.
    if (syncedAddress.current === address) return
    // Wallet switched without a disconnect: drop the previous wallet's caches
    // so wallet-scoped keys can't leak across identities.
    if (syncedAddress.current) {
      void qc.cancelQueries()
      qc.clear()
      clearPersistedQueryCache()
    }
    syncedAddress.current = address

    // Returning user: recover the persisted session silently and NEVER pop
    // MetaMask. If recovery fails the app stays read-only until "Sign in".
    if (hasSignedInMarker(address)) {
      recoverWalletSession(address)
        .then((recovered) => {
          if (tokenRef.current !== myToken || !recovered) return
          void qc.invalidateQueries({ queryKey: ['wallet-session'] })
          void qc.invalidateQueries({ queryKey: ['current-user'] })
        })
        .catch((error) => {
          console.warn('[useSyncUser] silent session recovery failed:', error)
        })
      return
    }

    ensureWalletSession(address, { signMessage: signWalletMessage })
      .then(({ user }) => {
        if (tokenRef.current !== myToken) return
        // No profile yet → open Edit Profile (once per session).
        if (user && !user.nickname && redirectedAddress.current !== address) {
          redirectedAddress.current = address
          navigate('/app/profile/edit')
        }
        // `user === null` means the user declined the signature — stay read-only.
        if (user) {
          void claimPendingReferralIfPresent().catch((err) =>
            console.warn('[useSyncUser] referral claim failed:', err),
          )
        }
      })
      .catch((error) => {
        if (tokenRef.current !== myToken) return
        console.warn('[useSyncUser] ensureWalletSession failed:', error)
        syncedAddress.current = null
      })
  }, [address, isConnected, navigate, qc])
}

/** First-touch attribution: claim a stashed /r/CODE after first sign-in. */
async function claimPendingReferralIfPresent(): Promise<void> {
  const code = consumePendingReferral()
  if (!code || !isValidReferralCode(code)) return
  const result = await claimReferral(code)
  if (!result.ok && result.error) {
    console.warn('[useSyncUser] referral rejected:', result.error)
  }
}

/** Mount once high in the tree; renders nothing. */
export const UserSync: FC = () => {
  useSyncUser()
  return null
}
