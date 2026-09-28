import type { Notification, NotificationChannel, NotificationKind } from '@/types/database'
import { sendEmail } from './channels/email'

interface DispatchInput {
  notification: Notification
  prefs: Partial<Record<NotificationChannel, boolean>>
  contacts: Partial<Record<NotificationChannel, string | null>>
}

interface DispatchResult {
  channel: NotificationChannel
  delivered: boolean
  error?: string
}

const ALL_CHANNELS: NotificationChannel[] = ['inapp', 'email']

/**
 * Multi-channel dispatcher for *external* channels. In-app is implicit in the
 * notification row the DB triggers insert; this fans out per-user, per-channel
 * based on `notification_preferences`. Add a channel by implementing
 * `channels/<name>.ts` and adding it to `ALL_CHANNELS`.
 */
export async function dispatchNotification(input: DispatchInput): Promise<DispatchResult[]> {
  const results: DispatchResult[] = []

  for (const channel of ALL_CHANNELS) {
    const enabled = input.prefs[channel] ?? channel === 'inapp'
    if (!enabled) {
      results.push({ channel, delivered: false, error: 'disabled' })
      continue
    }
    try {
      switch (channel) {
        case 'inapp':
          // Already persisted by the DB trigger.
          results.push({ channel, delivered: true })
          break
        case 'email':
          await sendEmail(input.notification, input.contacts.email ?? null)
          results.push({ channel, delivered: true })
          break
      }
    } catch (err) {
      results.push({
        channel,
        delivered: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

/** Human-readable subject, e.g. `[Trade] Offer accepted`. */
export function renderNotificationSubject(n: Pick<Notification, 'kind' | 'title' | 'body'>) {
  return `[${labelForKind(n.kind)}] ${n.title}`
}

function labelForKind(kind: NotificationKind): string {
  switch (kind) {
    case 'message':
      return 'Message'
    case 'trade_update':
      return 'Trade'
    case 'dispute_update':
      return 'Dispute'
    case 'system':
      return 'System'
  }
}
