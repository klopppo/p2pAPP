import type { Notification } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { renderNotificationSubject } from '..'

/**
 * Email channel.
 *
 * Sends via a Supabase Edge Function called `send-email`. The function is
 * intentionally NOT bundled here — it lives under `supabase/functions/`
 * and can use any provider (Resend, SendGrid, SES, etc.). The body contract
 * is lean for a reason — see docs/security-audit.md §6:
 *
 *   { user_id: string; subject: string; text: string }
 *
 * The recipient is RESOLVED SERVER-SIDE by the edge function from the user's
 * `notification_preferences` row. The client never sends an address (that
 * was the open relay). `html` is unsupported — text only.
 *
 * `to` is used only as a local hint: when the dispatcher's snapshot says the
 * user has no email contact on file we skip the network call entirely. When a
 * contact exists we still let the edge function resolve authoritatively.
 *
 * If the edge function isn't deployed yet (dev environments) we silently
 * log the email locally so QA still gets feedback.
 */
export async function sendEmail(notification: Notification, to: string | null) {
  if (!to) {
    console.warn('[notifications/email] skipped — no email_address on file', {
      user_id: notification.user_id,
      id: notification.id,
    })
    return
  }

  const subject = renderNotificationSubject(notification)
  const text = `${notification.title}\n\n${notification.body}\n\nOpen: ${appUrl(
    notification
  )}`

  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: { user_id: notification.user_id, subject, text },
    })
    if (error) throw error
  } catch (err) {
    console.warn(
      '[notifications/email] edge function unavailable, logging locally:',
      err
    )
    // Local dev fallback: keep the payload visible in the console so engineers
    // can verify the dispatcher wiring without a deployed edge function.
    // Recipient stays derived server-side; never log an address here.
    console.info('[notifications/email:dry-run]', {
      user_id: notification.user_id,
      subject,
      text,
    })
  }
}


function appUrl(n: Notification): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (n.conversation_id) return `${origin}/app/messages/${n.conversation_id}`
  if (n.trade_id) return `${origin}/app/trade/${n.trade_id}`
  return `${origin}/app/messages`
}
