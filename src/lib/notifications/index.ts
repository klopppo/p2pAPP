import type {
  Notification,
  NotificationChannel,
  NotificationKind,
} from '@/types/database'
import { sendInApp } from './channels/inapp'
import { sendEmail } from './channels/email'

export interface DispatchInput {
  notification: Notification
  /** Map of which channels are enabled for this user. */
  prefs: Partial<Record<NotificationChannel, boolean>>
  /** Resolved contact info per channel (e.g. email address). */
  contacts: Partial<Record<NotificationChannel, string | null>>
}

export interface DispatchResult {
  channel: NotificationChannel
  delivered: boolean
  error?: string
}

/**
 * Multi-channel notification dispatcher.
 *
 * The chat app writes notification rows directly via the `notify_*` DB
 * triggers (in-app is implicit in the row insert). This dispatcher exists
 * for *external* channels — email today, SMS/push tomorrow — and decides
 * per-user, per-channel whether to fan out based on
 * `notification_preferences`.
 *
 * Add a new channel by:
 *   1. Implementing it in `channels/<name>.ts` with a `send` function.
 *   2. Adding it to `ALL_CHANNELS` below.
 *   3. Adding it to the `notification_channel` enum in the migration.
 *
 * That's it — no callers need to change.
 */
const ALL_CHANNELS: NotificationChannel[] = ['inapp', 'email']

export async function dispatchNotification(
  input: DispatchInput
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = []

  for (const channel of ALL_CHANNELS) {
    const enabled = input.prefs[channel] ?? defaultEnabled(channel)
    if (!enabled) {
      results.push({ channel, delivered: false, error: 'disabled' })
      continue
    }

    try {
      switch (channel) {
        case 'inapp':
          // Already persisted by the DB trigger; nothing more to do here.
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

function defaultEnabled(channel: NotificationChannel): boolean {
  // Match the row defaults set by `ensureDefaultNotificationPreferences`.
  return channel === 'inapp'
}

/**
 * Convenience: render a human-readable subject for a notification. Used by
 * email and any future channel that needs a string outside the row itself.
 */
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

export { sendInApp }
export { sendEmail }
