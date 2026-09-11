import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { clearPersistedQueryCache } from '@/lib/queryPersister'
import { ensureWalletSession, signOut } from '@/lib/supabase'
import { signWalletMessage } from '@/lib/walletSigner'

/**
 * Keeps the Supabase `users` row in sync with the connected wallet.
 *
 * Whenever a wallet connects (or the active account changes) this:
 *   1. Establishes/verifies a Supabase session by checking live tokens or signing
 *      an SIWE challenge (handled by `ensureWalletSession` -> `siwe-auth` edge function).
 *   2. Ensures a `users` row exists for the wallet.
 *
 * Race fix: a monotonically increasing `token` is bumped on every
 * (re)connect/disconnect. The async `ensureWalletSession` callback captures
 * the token at call-time and only commits its result to the refs if the
 * token still matches. Out-of-order resolutions are dropped on the floor.
 * Without this, a connect→disconnect→reconnect cycle could let the original
 * in-flight sign-in overwrite the new session with the old wallet's user row.
 *
 * Onboarding: if the row has no profile yet (no nickname), the user is sent
 * straight to the Edit Profile page so they can create one.
 */
export function useSyncUser() {
  const { address, isConnected } = useAccount()
  const syncedAddress = useRef<string | null>(null)
  const redirectedAddress = useRef<string | null>(null)
  const navigate = useNavigate()
  // Token bumped on every wallet state change. Captured by async callbacks
  // so stale resolutions from a prior address can no-op.
  const tokenRef = useRef(0)

  useEffect(() => {
    const myToken = ++tokenRef.current

    if (!isConnected || !address) {
      // Wallet gone: tear down the Supabase session + caches so the stale
      // session can't keep authorizing reads/writes as the old wallet.
      // Bump the token first so any in-flight ensureWalletSession from the
      // previous connect is ignored when it resolves.
      const prev = syncedAddress.current
      syncedAddress.current = null
      if (prev) {
        clearPersistedQueryCache()
        void signOut().catch((signOutErr) => {
          console.warn('[useSyncUser] signOut on wallet disconnect failed:', signOutErr)
        })
      }
      return
    }

    // Skip redundant sign-ins for an address we already synced in this session.
    if (syncedAddress.current === address) return
    syncedAddress.current = address

    ensureWalletSession(address, { signMessage: signWalletMessage })
      .then(({ user }) => {
        // Drop the result if a newer connect/disconnect has superseded us.
        if (tokenRef.current !== myToken) return
        // No profile created yet → open the Edit Profile page to create one.
        // Only once per session, so closing the page doesn't loop the redirect.
        if (user && !user.nickname && redirectedAddress.current !== address) {
          redirectedAddress.current = address
          navigate('/app/profile/edit')
        }
        // If `user` is null the user declined the wallet signature — stay
        // read-only for this wallet.
      })
      .catch((error) => {
        if (tokenRef.current !== myToken) return
        console.warn('[useSyncUser] ensureWalletSession failed:', error)
        // Reset so a later re-render can retry.
        syncedAddress.current = null
      })
  }, [address, isConnected, navigate])
}

/**
 * Mount this once, high in the tree (inside Wagmi/RainbowKit providers AND the
 * router), to enable global user syncing on wallet connect. Renders nothing.
 */
export const UserSync: FC = () => {
  useSyncUser()
  return null
}
