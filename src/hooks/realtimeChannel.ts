import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type SharedChangePayload = RealtimePostgresChangesPayload<Record<string, unknown>>

// One postgres_changes channel per topic, shared across hook instances:
// ChatLayout mounts the active + archived conversation lists together, and the
// bell/dispatcher share the notification channel. Refs close the channel when
// the last subscriber unmounts.
const channels = new Map<
  string,
  { refs: number; channel: RealtimeChannel; listeners: Set<(payload: SharedChangePayload) => void> }
>()

/** Subscribe to a shared `postgres_changes` channel; returns the cleanup. */
export function subscribeShared(
  topic: string,
  filter: { schema: string; table: string; filter?: string },
  listener: (payload: SharedChangePayload) => void,
): () => void {
  let entry = channels.get(topic)
  if (!entry) {
    const listeners = new Set<(payload: SharedChangePayload) => void>()
    const channel = supabase
      .channel(topic)
      .on('postgres_changes', { event: '*', ...filter }, (payload) => {
        for (const fn of listeners) fn(payload)
      })
      .subscribe()
    entry = { refs: 0, channel, listeners }
    channels.set(topic, entry)
  }
  entry.refs += 1
  entry.listeners.add(listener)
  return () => {
    entry.listeners.delete(listener)
    entry.refs -= 1
    if (entry.refs > 0) return
    channels.delete(topic)
    void supabase.removeChannel(entry.channel)
  }
}
