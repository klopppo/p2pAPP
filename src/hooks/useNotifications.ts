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

/**
 * Newest-first notifications for the bell dropdown. Live-updated via
 * Realtime `postgres_changes` so a new message anywhere fires a feed row
 * without polling.
 */
export function useNotifications() {
  const { data: user } = useCurrentUser()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => listNotifications(user!.id),
    enabled: !!user,
  })

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`notifications:user:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ['notifications', user.id] })
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ['notifications', user.id] })
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, qc])

  return query
}

/**
 * Unread count for the navbar bell badge. Refreshed every 60s as a safety
 * net in case the realtime connection blips.
 */
export function useUnreadCount() {
  const { data: user } = useCurrentUser()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['notifications:unread', user?.id],
    queryFn: () => getUnreadNotificationCount(user!.id),
    enabled: !!user,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`notifications-unread:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ['notifications:unread', user.id] })
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, qc])

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

  const query = useQuery({
    queryKey: ['notification-prefs', user?.id],
    queryFn: async () => {
      if (!user) return []
      await ensureDefaultNotificationPreferences(user.id)
      return getNotificationPreferences(user.id)
    },
    enabled: !!user,
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
