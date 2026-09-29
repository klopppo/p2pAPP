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
  const isNew = !entry
  if (!entry) {
    const listeners = new Set<(payload: SharedChangePayload) => void>()
    const channel = supabase
      .channel(topic)
      .on('postgres_changes', { event: '*', ...filter }, (payload) => {
        for (const fn of listeners) fn(payload)
      })
    entry = { refs: 0, channel, listeners }
    channels.set(topic, entry)
  }
  const shared = entry
  shared.refs += 1
  // Attach BEFORE subscribing: the callback fans out through this Set, so a
  // payload delivered on the join tick must already find its listener.
  shared.listeners.add(listener)
  if (isNew) shared.channel.subscribe()
  return () => {
    shared.listeners.delete(listener)
    shared.refs -= 1
    if (shared.refs > 0) return
    // Only retire the entry if the map still points at it — a cleanup from a
    // superseded entry must not evict a newer channel for the same topic.
    if (channels.get(topic) === shared) {
      channels.delete(topic)
      void supabase.removeChannel(shared.channel)
    }
  }
}
