import { useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  getNotificationPreferences,
  upsertNotificationPreference,
  ensureDefaultNotificationPreferences,
} from '@/lib/supabase'
import type { NotificationChannel } from '@/types/database'
import { useCurrentUser } from './useCurrentUser'
import { useWalletSession } from './useWalletSession'
import { subscribeShared } from './realtimeChannel'

/**
 * Newest-first notifications for the bell dropdown, live-updated via Realtime.
 * The `users` row resolves without a JWT (world-readable), so reads gate on
 * the live session or they would cache an empty feed.
 */
export function useNotifications() {
  const { data: user } = useCurrentUser()
  const { sessionWallet, hasSession } = useWalletSession()
  const qc = useQueryClient()
  const userId = user?.id

  const query = useQuery({
    queryKey: ['notifications', userId, sessionWallet],
    queryFn: () => listNotifications(user!.id),
    enabled: !!userId && hasSession,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (!userId || !hasSession) return
    // Shares one channel with `useUnreadCount` (same user + filter).
    return subscribeShared(
      `notifications:user:${userId}`,
      { schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => qc.invalidateQueries({ queryKey: ['notifications', userId] }),
    )
  }, [userId, hasSession, qc])

  return query
}

/** Unread count for the navbar badge, refreshed every 60s as a safety net. */
export function useUnreadCount() {
  const { data: user } = useCurrentUser()
  const { sessionWallet, hasSession } = useWalletSession()
  const qc = useQueryClient()
  const userId = user?.id

  const query = useQuery({
    queryKey: ['notifications:unread', userId, sessionWallet],
    queryFn: () => getUnreadNotificationCount(user!.id),
    enabled: !!userId && hasSession,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!userId || !hasSession) return
    // Shares one channel with `useNotifications` (same user + filter).
    return subscribeShared(
      `notifications:user:${userId}`,
      { schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => qc.invalidateQueries({ queryKey: ['notifications:unread', userId] }),
    )
  }, [userId, hasSession, qc])

  return query
}

function useInvalidateNotifications() {
  const { data: user } = useCurrentUser()
  const qc = useQueryClient()
  return useCallback(() => {
    if (!user) return
    qc.invalidateQueries({ queryKey: ['notifications', user.id] })
    qc.invalidateQueries({ queryKey: ['notifications:unread', user.id] })
  }, [user, qc])
}

export function useMarkNotificationRead() {
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: useInvalidateNotifications(),
  })
}

export function useMarkAllRead() {
  const { data: user } = useCurrentUser()
  return useMutation({
    mutationFn: async () => {
      if (user) await markAllNotificationsRead(user.id)
    },
    onSuccess: useInvalidateNotifications(),
  })
}

/**
 * Per-channel preferences. `ensureDefaults()` guarantees both `inapp` and
 * `email` rows exist so the dispatcher can always read a value.
 */
export function useNotificationPreferences() {
  const { data: user } = useCurrentUser()
  const { sessionWallet, hasSession } = useWalletSession()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['notification-prefs', user?.id, sessionWallet],
    queryFn: async () => {
      if (!user) return []
      await ensureDefaultNotificationPreferences(user.id)
      return getNotificationPreferences(user.id)
    },
    enabled: !!user && hasSession,
  })

  const setEnabled = useCallback(
    async (channel: NotificationChannel, enabled: boolean) => {
      if (!user) return
      await upsertNotificationPreference({ userId: user.id, channel, enabled })
      await qc.invalidateQueries({ queryKey: ['notification-prefs', user.id] })
    },
    [user, qc]
  )

  return { ...query, setEnabled }
}
