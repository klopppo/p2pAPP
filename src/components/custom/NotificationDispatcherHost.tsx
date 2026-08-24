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

          const prefsMap = prefs.data
            ? Object.fromEntries(prefs.data.map((p) => [p.channel, p.enabled]))
            : { inapp: true, email: false }
          const contacts: Record<string, string | null> = prefs.data
            ? Object.fromEntries(
                prefs.data.map((p) => [p.channel, p.email_address])
              )
            : {}
          // `User.email` lives on the private profile (UserPrivate) which the
          // public `useCurrentUser` does not load. NotificationPreferences
          // already carries the email contact when the user opted in; if it
          // isn't present the dispatch layer skips the email channel.

          await dispatchNotification({
            notification: n,
            prefs: prefsMap,
            contacts,
          })

          // Make sure the bell feed picks up the new row.
          qc.invalidateQueries({ queryKey: ['notifications', user.id] })
          qc.invalidateQueries({ queryKey: ['notifications:unread', user.id] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, prefs.data, qc])

  return null
}
