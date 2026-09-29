import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useWalletSession } from '@/hooks/useWalletSession'
import { useNotificationPreferences } from '@/hooks/useNotifications'
import { subscribeShared } from '@/hooks/realtimeChannel'
import { dispatchNotification } from '@/lib/notifications'
import type { Notification } from '@/types/database'

/**
 * Mounted once in the app shell: fans realtime `notifications` rows out to the
 * user's enabled channels. Deduped via a FIFO-capped `seen` Set; subscribes
 * only after prefs resolve. Renders nothing.
 */

const SEEN_MAX = 500

export function NotificationDispatcherHost() {
  const { data: user } = useCurrentUser()
  const { hasSession } = useWalletSession()
  const prefs = useNotificationPreferences()
  const qc = useQueryClient()
  const seen = useRef<Set<string>>(new Set())
  // FIFO order so we can evict the oldest entry once `SEEN_MAX` is reached.
  const seenQueue = useRef<string[]>([])
  // Mirror prefs into a ref so the subscription callback reads the latest values.
  const prefsRef = useRef(prefs.data)
  useEffect(() => {
    prefsRef.current = prefs.data
  }, [prefs.data])

  const userId = user?.id

  useEffect(() => {
    // Wait for a live session AND resolved prefs so we never dispatch on the
    // hard-coded fallback while unauthenticated (RLS would deny any read).
    if (!hasSession || !userId || prefs.isLoading) return

    // Shares ONE `notifications:user:<id>` channel with useNotifications /
    // useUnreadCount (same filter); only INSERTs fan out to channels.
    return subscribeShared(
      `notifications:user:${userId}`,
      {
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.eventType !== 'INSERT') return
        const n = payload.new as unknown as Notification
        if (!n?.id || seen.current.has(n.id)) return
        seen.current.add(n.id)
        // FIFO eviction: once the window exceeds SEEN_MAX, drop the
        // oldest id from both the Set and the queue.
        seenQueue.current.push(n.id)
        if (seenQueue.current.length > SEEN_MAX) {
          const evict = seenQueue.current.shift()
          if (evict !== undefined) seen.current.delete(evict)
        }

        const currentPrefs = prefsRef.current
        const prefsMap = currentPrefs
          ? Object.fromEntries(currentPrefs.map((p) => [p.channel, p.enabled]))
          : { inapp: true, email: false }
        const contacts: Record<string, string | null> = currentPrefs
          ? Object.fromEntries(
              currentPrefs.map((p) => [p.channel, p.email_address])
            )
          : {}

        void dispatchNotification({
          notification: n,
          prefs: prefsMap,
          contacts,
        }).catch((err) => {
          console.warn('[NotificationDispatcherHost] dispatch failed:', err)
        })

        qc.invalidateQueries({ queryKey: ['notifications', userId] })
        qc.invalidateQueries({ queryKey: ['notifications:unread', userId] })
      },
    )
  }, [hasSession, userId, prefs.isLoading, qc])

  return null
}
