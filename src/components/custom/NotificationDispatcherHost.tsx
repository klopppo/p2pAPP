import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useNotificationPreferences } from '@/hooks/useNotifications'
import { dispatchNotification } from '@/lib/notifications'
import type { Notification } from '@/types/database'

/**
 * Mounted once inside the app shell. Subscribes to `notifications` for the
 * current user and fans each new row out to the enabled channels via
 * `dispatchNotification`. Renders nothing.
 *
 * Dedup: `notification.id` is recorded in a FIFO-capped `seen` Set (max
 * `SEEN_MAX`) so reconnects don't dispatch the same row twice AND the Set
 * can't grow unbounded over a long session.
 *
 * Gating: the realtime channel is only created once the prefs query has
 * resolved (`prefs.isLoading === false`). Before that point we have no
 * idea which channels the user has enabled and would dispatch to a
 * hard-coded `{inapp:true, email:false}` default.
 */

const SEEN_MAX = 500

export function NotificationDispatcherHost() {
  const { data: user } = useCurrentUser()
  const prefs = useNotificationPreferences()
  const qc = useQueryClient()
  const seen = useRef<Set<string>>(new Set())
  // FIFO order so we can evict the oldest entry once `SEEN_MAX` is reached.
  const seenQueue = useRef<string[]>([])
  // Mirror `prefs.data` into a ref so the realtime subscription callback
  // (which closes over the ref) always reads the latest preferences. Updating
  // the ref inside a `useEffect` (not during render) keeps the component pure.
  const prefsRef = useRef(prefs.data)
  useEffect(() => {
    prefsRef.current = prefs.data
  }, [prefs.data])

  useEffect(() => {
    // Wait for prefs before subscribing — otherwise we'd dispatch to the
    // hard-coded fallback (`{inapp:true,email:false}`) and the user might
    // have inapp disabled.
    if (!user || prefs.isLoading) return

    const channel = supabase
      .channel(`notif-dispatcher:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const n = payload.new as Notification
          if (seen.current.has(n.id)) return
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

          await dispatchNotification({
            notification: n,
            prefs: prefsMap,
            contacts,
          })

          qc.invalidateQueries({ queryKey: ['notifications', user.id] })
          qc.invalidateQueries({ queryKey: ['notifications:unread', user.id] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, prefs.isLoading, qc])

  return null
}
