import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import { useAccount } from 'wagmi'
import { clearPersistedQueryCache } from '@/lib/queryPersister'
import { signOut } from '@/lib/supabase'

/**
 * Wallet-disconnect cleanup hook.
 *
 * Previously this hook also called `ensureWalletSession` on every wallet
 * connect — i.e. it auto-popped the MetaMask SIWE prompt the instant a
 * wallet became connected. That was removed because the user explicitly
 * wanted the signature prompt to be button-driven (only on demand from
 * `SignInPrompt` or the inline-SIWE retry paths in CreateOffer /
 * EditOffer). The auto-pop was the most common cause of "I keep getting
 * asked for a signature" complaints.
 *
 * What remains:
 *   - On disconnect, tear down the Supabase session + clear the persisted
 *     react-query cache so the next connect (with any wallet) starts
 *     clean. Without this, the previous wallet's cache + session can
 *     keep authorizing reads/writes for the now-disconnected user.
 *
 * The actual SIWE signature flow now lives entirely in SignInPrompt +
 * the inline retry paths in CreateOfferPage / EditOfferPage. The
 * SignInPrompt itself is button-driven, so the user only sees the
 * MetaMask popup when they click "Sign message".
 */
export function useSyncUser() {
  const { address, isConnected } = useAccount()
  const syncedAddress = useRef<string | null>(null)
  // Bumped on every wallet state change so any in-flight async cleanup
  // can detect "the user has done something else since this fired" and
  // no-op rather than racing the new state.
  const tokenRef = useRef(0)

  useEffect(() => {
    const myToken = ++tokenRef.current

    if (!isConnected || !address) {
      // Wallet gone: tear down the Supabase session + caches so the stale
      // session can't keep authorizing reads/writes as the old wallet.
      const prev = syncedAddress.current
      syncedAddress.current = null
      if (prev) {
        clearPersistedQueryCache()
        void signOut().catch((signOutErr) => {
          if (tokenRef.current !== myToken) return
          console.warn('[useSyncUser] signOut on wallet disconnect failed:', signOutErr)
        })
      }
      return
    }

    // Note: we deliberately do NOT auto-call ensureWalletSession here.
    // The SignInPrompt component handles the connect → sign-in flow on
    // demand. Auto-popping the MetaMask SIWE prompt on every connect
    // was the worst UX possible — the user explicitly opted to drive
    // the sign-in via an explicit button click instead.
    //
    // The success / rejection localStorage markers (`coffernode:siwe:last`
    // + `coffernode:siwe:declined:<addr>`) are the source of truth for
    // "is this wallet signed in?" — they're written by the SIWE backend
    // and read by SignInPrompt's visibility check. No global re-sync
    // needed.
  }, [address, isConnected])
}

/**
 * Mount this once, high in the tree (inside Wagmi/RainbowKit providers AND
 * the router), to wire the disconnect cleanup. Renders nothing.
 */
export const UserSync: FC = () => {
  useSyncUser()
  return null
}