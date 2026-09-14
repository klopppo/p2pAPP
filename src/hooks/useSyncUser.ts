import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { clearPersistedQueryCache } from '@/lib/queryPersister'
import { recoverWalletSession, signOut, claimReferral } from '@/lib/supabase'
import { consumePendingReferral, isValidReferralCode } from '@/lib/referral'
import { useWalletSession } from '@/hooks/useWalletSession'

const SUCCESS_KEY = 'coffernode:siwe:last'

/**
 * Whether this device already completed SIWE for `addr` (remember-me marker).
 * A marker means we must NOT auto-prompt MetaMask on reload — only an explicit
 * Disconnect clears it.
 */
function hasSignedInMarker(addr: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(SUCCESS_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { address?: string }
    return parsed?.address?.toLowerCase() === addr.toLowerCase()
  } catch {
    return false
  }
}

/**
 * Keeps the Supabase `users` row in sync with the connected wallet — without
 * forcing the sign-in on connect.
 *
 * Connecting a wallet NEVER pops MetaMask: every wallet connects freely and
 * the app stays read-only until the user explicitly signs in (navbar "Sign
 * in" or any action that needs the session, like publishing an offer). The
 * sync itself happens there, via `ensureWalletSession` called from
 * WalletConnectButton / the offer forms.
 *
 * This hook handles the remaining housekeeping:
 *   - Returning user on this device (SIWE success marker): silently restores
 *     the persisted Supabase session via `recoverWalletSession` — no popup.
 *   - Disconnect: tears down the Supabase session + caches so the stale
 *     session can't keep authorizing reads/writes as the old wallet.
 *   - Referral attribution: claims a pending /r/<CODE> once the wallet's
 *     session actually goes live (however sign-in happened), not on connect.
 *
 * Race fix: a monotonically increasing `token` is bumped on every
 * (re)connect/disconnect. The async `recoverWalletSession` callback captures
 * the token at call-time and only commits its result if the token still
 * matches. Out-of-order resolutions are dropped on the floor.
 * Without this, a connect→disconnect→reconnect cycle could let the original
 * in-flight recovery overwrite the new session with the old wallet's row.
 */
export function useSyncUser() {
  const { address, isConnected } = useAccount()
  const { hasSession } = useWalletSession()
  const syncedAddress = useRef<string | null>(null)
  const claimedAddress = useRef<string | null>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()
  // Token bumped on every wallet state change. Captured by async callbacks
  // so stale resolutions from a prior address can no-op.
  const tokenRef = useRef(0)
  // Tracks whether the wallet was connected on a previous render, so a
  // disconnect can be distinguished from the initial not-yet-reconnected
  // mount (wagmi reports `isConnected: false` before it restores the session).
  const wasConnectedRef = useRef(false)

  // After a wallet disconnect, send the user back to the marketplace. Watched
  // on the isConnected transition (not on our own Disconnect button) so a
  // disconnect from RainbowKit's account modal behaves identically. The ref
  // starts false, so a cold load that hasn't restored a session yet is a no-op.
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
      // Wallet gone: tear down the Supabase session + caches so the stale
      // session can't keep authorizing reads/writes as the old wallet.
      // Bump the token first so any in-flight recovery from the previous
      // connect is ignored when it resolves.
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

    // Skip redundant work for an address we already handled in this session.
    if (syncedAddress.current === address) return
    syncedAddress.current = address

    // New wallet (or new device for a known wallet): connect FREELY, without
    // any Supabase sync. No signature popup, no forced session — the app
    // stays read-only until the user explicitly signs in elsewhere
    // (WalletConnectButton / the offer forms).
    //
    // Returning user on this device (SIWE success marker): recover the
    // persisted Supabase session silently (valid claim, or exchange the
    // stored refresh token) and NEVER pop MetaMask. If recovery fails, the
    // app stays read-only until an explicit "Sign in" click.
    if (hasSignedInMarker(address)) {
      recoverWalletSession(address)
        .then((recovered) => {
          if (tokenRef.current !== myToken || !recovered) return
          // The token may have been refreshed/repaired — let the gate re-read.
          void qc.invalidateQueries({ queryKey: ['wallet-session'] })
          void qc.invalidateQueries({ queryKey: ['current-user'] })
        })
        .catch((error) => {
          console.warn('[useSyncUser] silent session recovery failed:', error)
        })
    }
  }, [address, isConnected, navigate, qc])

  // Referral attribution is tied to the live session, NOT to wallet connect:
  // it fires once per (address, session) as soon as the wallet's Supabase
  // session actually exists, so explicit sign-ins and silent recovery both
  // count. `consumePendingReferral` clears the marker whatever the outcome.
  useEffect(() => {
    if (!isConnected || !address || !hasSession) return
    const lower = address.toLowerCase()
    if (claimedAddress.current === lower) return
    claimedAddress.current = lower
    void claimPendingReferralIfPresent().catch((err) =>
      console.warn('[useSyncUser] referral claim failed:', err),
    )
  }, [address, isConnected, hasSession])
}

/**
 * Best-effort first-touch attribution: if this device landed on a /r/CODE
 * link before the wallet completed its first session, claim the code now.
 * `consumePendingReferral` clears the marker whatever the outcome, so a bad
 * or already-used code can't loop on every reconnect.
 */
async function claimPendingReferralIfPresent(): Promise<void> {
  const code = consumePendingReferral()
  if (!code || !isValidReferralCode(code)) return
  const result = await claimReferral(code)
  if (!result.ok && result.error) {
    console.warn('[useSyncUser] referral rejected:', result.error)
  }
}

/**
 * Mount this once, high in the tree (inside Wagmi/RainbowKit providers AND the
 * router), to enable global user syncing on wallet connect. Renders nothing.
 */
export const UserSync: FC = () => {
  useSyncUser()
  return null
}
