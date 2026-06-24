import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import { useAccount } from 'wagmi'
import { upsertUser } from '@/lib/supabase'

/**
 * Keeps the Supabase `users` row in sync with the connected wallet.
 *
 * Whenever a wallet connects (or the active account changes), this upserts a
 * user row keyed by the wallet address so the rest of the app (reputation,
 * trades, profile) has a record to work with. Safe to mount globally; it only
 * writes when the address actually changes.
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

    upsertUser(address).catch((error) => {
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
