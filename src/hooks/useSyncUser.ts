import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { ensureUser } from '@/lib/supabase'

/**
 * Keeps the Supabase `users` row in sync with the connected wallet.
 *
 * Whenever a wallet connects (or the active account changes), this ensures a
 * user row exists keyed by the wallet address. Unlike the old `upsertUser`,
 * `ensureUser` does NOT overwrite profile fields (nickname, bio, etc.) — it
 * only inserts a new row if missing and touches `last_active_at`.
 *
 * Onboarding: if the row has no profile yet (no nickname), the user is sent
 * straight to the Edit Profile page so they can create one.
 */
export function useSyncUser() {
  const { address, isConnected } = useAccount()
  const syncedAddress = useRef<string | null>(null)
  const redirectedAddress = useRef<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isConnected || !address) {
      syncedAddress.current = null
      return
    }

    // Skip redundant writes for an address we already synced.
    if (syncedAddress.current === address) return
    syncedAddress.current = address

    ensureUser(address)
      .then((user) => {
        // No profile created yet → open the Edit Profile page to create one.
        // Only once per session, so closing the page doesn't loop the redirect.
        if (!user.nickname && redirectedAddress.current !== address) {
          redirectedAddress.current = address
          navigate('/app/profile/edit')
        }
      })
      .catch((error) => {
        console.error('[useSyncUser] Failed to sync user to Supabase:', error)
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
