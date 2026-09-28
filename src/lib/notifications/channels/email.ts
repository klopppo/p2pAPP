import type { Notification } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { renderNotificationSubject } from '..'

/**
 * Email channel via the `send-email` edge function. The recipient is resolved
 * SERVER-SIDE from `notification_preferences` — the client never sends an
 * address. `to` is only a local hint to skip the call when no contact exists.
 * If the function isn't deployed (dev), the send is silently skipped.
 */
export async function sendEmail(notification: Notification, to: string | null) {
  if (!to) return

  const subject = renderNotificationSubject(notification)
  const text = `${notification.title}\n\n${notification.body}\n\nOpen: ${appUrl(notification)}`

  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: { user_id: notification.user_id, subject, text },
    })
    if (error) throw error
  } catch {
    // Edge function unavailable — silently skip.
  }
}

function appUrl(n: Notification): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (n.conversation_id) return `${origin}/app/messages/${n.conversation_id}`
  if (n.trade_id) return `${origin}/app/trades/${n.trade_id}`
  return `${origin}/app/messages`
}
