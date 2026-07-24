import type { Notification } from '@/types/database'

/**
 * In-app channel.
 *
 * In-app notifications are persisted by the DB trigger
 * `notify_conversation_message` (see migration 20260724000005), so by the
 * time the dispatcher sees them the row is already in `notifications`. This
 * function is a no-op kept for symmetry with the other channels; callers
 * that want to do anything extra (e.g. toast in the corner) can hook here.
 */
export async function sendInApp(notification: Notification) {
  // No-op. The UI picks up the row via `useNotifications()`.
  void notification
}
