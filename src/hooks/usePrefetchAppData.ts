import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount, useChainId } from 'wagmi'
import {
  ensureUser,
  getActiveOffers,
  getDisputesByUser,
  getRatingsByUser,
  getReputationScores,
  getTradesByUser,
  getUnreadNotificationCount,
  getUserByWallet,
  getOffersBySeller,
  listConversations,
  listNotifications,
  ensureDefaultNotificationPreferences,
  getNotificationPreferences,
} from '@/lib/supabase'
import { useWalletSession } from './useWalletSession'
import { useCurrentUser } from './useCurrentUser'

/**
 * Warms the React Query cache for every main app surface as soon as a live
 * Supabase session exists — so navigating to Offers / Trades / Disputes /
 * Messages / Notifications / Profile is instant instead of firing its first
 * fetch on mount.
 *
 * Keys MUST match the page hooks exactly (same raw wagmi `address`, same
 * `user.id`, same session wallet) or the page gets a cache miss and refetches.
 * Runs once per session wallet; sign-out → sign-in for another wallet re-runs.
 */
export function usePrefetchAppData() {
  const qc = useQueryClient()
  const { address } = useAccount()
  const chainId = useChainId()
  const { sessionWallet, hasSession } = useWalletSession()
  const { data: user } = useCurrentUser()
  const prefetchedFor = useRef<string | null>(null)

  const userId = user?.id ?? null

  useEffect(() => {
    if (!hasSession || !sessionWallet || !address || !userId) return
    if (prefetchedFor.current === sessionWallet) return
    prefetchedFor.current = sessionWallet

    // Warmed entries stay fresh for a minute; the hooks' own intervals take
    // over after that. Failures are non-fatal — the page query retries on the
    // next mount.
    const staleTime = 60_000

    const warm = (queryKey: readonly unknown[], queryFn: () => Promise<unknown>) => {
      void qc.prefetchQuery({ queryKey, queryFn, staleTime })
    }

    // Identity / profile.
    warm(['current-user', address], () => ensureUser(address))
    warm(['user-profile', address], () => ensureUser(address))
    warm(['user-reviews', userId], () => getRatingsByUser(userId))
    warm(['user-reputation', userId], () => getReputationScores(userId))
    warm(['offers', 'seller', userId], () => getOffersBySeller(userId))

    // Public marketplace.
    warm(['offers'], () => getActiveOffers(50))

    // Private, wallet-scoped surfaces (all require the RLS session).
    warm(['conversations', userId, sessionWallet, 'active'], () =>
      listConversations(userId, { archived: false }),
    )
    warm(['notifications', userId, sessionWallet], () => listNotifications(userId))
    warm(['notifications:unread', userId, sessionWallet], () => getUnreadNotificationCount(userId))
    warm(['notification-prefs', userId, sessionWallet], async () => {
      await ensureDefaultNotificationPreferences(userId)
      return getNotificationPreferences(userId)
    })
    warm(['trades', 'by-wallet', address, sessionWallet, chainId], async () => {
      const u = await getUserByWallet(address)
      if (!u) return []
      return getTradesByUser(u.id)
    })
    warm(['disputes', 'by-wallet', address, sessionWallet], async () => {
      const u = await getUserByWallet(address)
      if (!u) return []
      return getDisputesByUser(u.id)
    })
  }, [hasSession, sessionWallet, address, chainId, userId, qc])
}
