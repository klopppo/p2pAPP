let instanceSeed = 0

/**
 * Unique realtime topic per hook *instance*.
 *
 * `supabase.channel(name)` deduplicates by name — a second consumer (or a
 * StrictMode remount) that calls `.on(...)` on the SAME name lands on the
 * already-subscribed channel and throws
 * `cannot add postgres_changes callbacks ... after subscribe()`. Appending a
 * per-instance suffix makes every `.on(...)` the first set of callbacks that
 * channel has ever seen.
 *
 * Only use this for POSTGRES_CHANGES subscriptions. Broadcast/presence topics
 * (typing, presence, notification dispatcher) are intended to be shared
 * across clients and must keep their bare names.
 */
export const uniqueRealtimeTopic = (base: string): string =>
  `${base}#${++instanceSeed}`

