import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { ensureWalletSession, signOut } from '@/lib/supabase'

/**
 * Keeps the Supabase `users` row in sync with the connected wallet.
 *
 * Whenever a wallet connects (or the active account changes) this:
 *   1. Establishes a Supabase session by signing an SIWE challenge (handled
 *      by the `siwe-auth` edge function → JWT → `ensureWalletSession`).
 *   2. Ensures a `users` row exists for the wallet.
 *
 * Onboarding: if the row has no profile yet (no nickname), the user is sent
 * straight to the Edit Profile page so they can create one.
 */
export function useSyncUser() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const syncedAddress = useRef<string | null>(null)
  const redirectedAddress = useRef<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isConnected || !address || !signMessageAsync) {
      // Wallet gone: tear down the Supabase session + caches so the stale
      // session can't keep authorizing reads/writes as the old wallet.
      if (syncedAddress.current) {
        void signOut().catch((signOutErr) => {
          console.warn('[useSyncUser] signOut on wallet disconnect failed:', signOutErr)
        })
      }
      syncedAddress.current = null
      return
    }

    // Skip redundant sign-ins for an address we already synced.
    if (syncedAddress.current === address) return
    syncedAddress.current = address

    ensureWalletSession(address, { signMessage: signMessageAsync })
      .then(({ user }) => {
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
        console.warn('[useSyncUser] ensureWalletSession failed:', error)
        // Reset so a later re-render can retry.
        syncedAddress.current = null
      })
  }, [address, isConnected, signMessageAsync, navigate])
}

/**
 * Mount this once, high in the tree (inside Wagmi/RainbowKit providers AND the
 * router), to enable global user syncing on wallet connect. Renders nothing.
 */
export const UserSync: FC = () => {
  useSyncUser()
  return null
}
