let instanceSeed = 0

/**
 * Unique realtime topic per hook *instance*: `supabase.channel(name)`
 * deduplicates by name, and adding postgres_changes callbacks to an
 * already-subscribed channel throws. Only use for POSTGRES_CHANGES
 * subscriptions — broadcast/presence topics must keep their bare names.
 */
export const uniqueRealtimeTopic = (base: string): string => `${base}#${++instanceSeed}`
