type Translate = (key: string, opts?: Record<string, unknown>) => string

interface TimeAgoKeys {
  now: string
  minutes: string
  hours: string
  days: string
  /** When set, ages of 30+ days collapse into a month count. */
  months?: string
}

/** Relative-time label; `keys` maps each branch to the caller's i18n namespace. */
export function timeAgo(iso: string, t: Translate, keys: TimeAgoKeys): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return t(keys.now)
  if (ms < 3_600_000) return t(keys.minutes, { count: Math.floor(ms / 60_000) })
  if (ms < 86_400_000) return t(keys.hours, { count: Math.floor(ms / 3_600_000) })
  const days = Math.floor(ms / 86_400_000)
  if (keys.months && days >= 30) return t(keys.months, { count: Math.floor(days / 30) })
  return t(keys.days, { count: days })
}
