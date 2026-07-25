import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import { useAccount } from 'wagmi'
import { ensureUser } from '@/lib/supabase'

/**
 * Keeps the Supabase `users` row in sync with the connected wallet.
 *
 * Whenever a wallet connects (or the active account changes), this ensures a
 * user row exists keyed by the wallet address. Unlike the old `upsertUser`,
 * `ensureUser` does NOT overwrite profile fields (nickname, bio, etc.) — it
 * only inserts a new row if missing and touches `last_active_at`.
 */
export function useSyncUser() {
  const { address, isConnected } = useAccount()
  const syncedAddress = useRef<string | null>(null)

  useEffect(() => {
    if (!isConnected || !address) {
      syncedAddress.current = null
      return
    }

    // Skip redundant writes for an address we already synced.
    if (syncedAddress.current === address) return
    syncedAddress.current = address

    ensureUser(address).catch((error) => {
      console.error('[useSyncUser] Failed to sync user to Supabase:', error)
      // Reset so a later re-render can retry.
      syncedAddress.current = null
    })
  }, [address, isConnected])
}

/**
 * Mount this once, high in the tree (inside Wagmi/RainbowKit providers), to
 * enable global user syncing on wallet connect. Renders nothing.
 */
export const UserSync: FC = () => {
  useSyncUser()
  return null
}
