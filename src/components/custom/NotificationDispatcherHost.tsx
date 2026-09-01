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
 * Renders are deduped by `notification.id` so the same row never dispatches
 * twice across reconnects.
 */
export function NotificationDispatcherHost() {
  const { data: user } = useCurrentUser()
  const prefs = useNotificationPreferences()
  const qc = useQueryClient()
  const seen = useRef<Set<string>>(new Set())
  // Mirror `prefs.data` into a ref so the realtime subscription callback
  // (which closes over the ref) always reads the latest preferences. Updating
  // the ref inside a `useEffect` (not during render) keeps the component pure.
  const prefsRef = useRef(prefs.data)
  useEffect(() => {
    prefsRef.current = prefs.data
  }, [prefs.data])

  useEffect(() => {
    if (!user) return

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
  }, [user?.id, qc])

  return null
}
