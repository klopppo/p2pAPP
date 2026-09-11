import { useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  supabase,
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
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic'

/**
 * Newest-first notifications for the bell dropdown. Live-updated via
 * Realtime `postgres_changes` so a new message anywhere fires a feed row
 * without polling.
 */
export function useNotifications() {
  const { data: user } = useCurrentUser()
  const { sessionWallet, hasSession } = useWalletSession()
  const qc = useQueryClient()
  const userId = user?.id

  const query = useQuery({
    queryKey: ['notifications', userId, sessionWallet],
    queryFn: () => listNotifications(user!.id),
    // A `users` row resolves for any connected wallet (the table is
    // world-readable), so gating on `userId` alone runs this read
    // unauthenticated and caches an empty feed. Gate on the live session.
    enabled: !!userId && hasSession,
    // Poll fallback for environments without Realtime publication on
    // `notifications` (same mechanism as useConversations). Realtime
    // invalidations keep this fresh when the publication is enabled.
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (!userId || !hasSession) return
    const channel = supabase
      .channel(uniqueRealtimeTopic(`notifications:user:${userId}`))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['notifications', userId] })
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['notifications', userId] })
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, hasSession, qc])

  return query
}

/**
 * Unread count for the navbar bell badge. Refreshed every 60s as a safety
 * net in case the realtime connection blips.
 */
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
    const channel = supabase
      .channel(uniqueRealtimeTopic(`notifications-unread:${userId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['notifications:unread', userId] })
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, hasSession, qc])

  return query
}

export function useMarkNotificationRead() {
  const { data: user } = useCurrentUser()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: () => {
      if (!user) return
      qc.invalidateQueries({ queryKey: ['notifications', user.id] })
      qc.invalidateQueries({ queryKey: ['notifications:unread', user.id] })
    },
  })
}

export function useMarkAllRead() {
  const { data: user } = useCurrentUser()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!user) return
      await markAllNotificationsRead(user.id)
    },
    onSuccess: () => {
      if (!user) return
      qc.invalidateQueries({ queryKey: ['notifications', user.id] })
      qc.invalidateQueries({ queryKey: ['notifications:unread', user.id] })
    },
  })
}

/**
 * Read + update the per-channel preferences. `ensureDefaults()` makes sure
 * the user has both `inapp` and `email` rows so the dispatcher can always
 * read a value (default = inapp on / email off).
 */
export function useNotificationPreferences() {
  const { data: user } = useCurrentUser()
  const { sessionWallet, hasSession } = useWalletSession()

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
      query.refetch()
    },
    [user, query]
  )

  return { ...query, setEnabled }
}
