// email-core -- pure, dependency-free helpers shared between the send-email
// edge function (Deno) and the vitest penetration suite (node).
//
// No `Deno.*` / external imports on purpose. Everything that decides whether an
// email is allowed (origin allowlist, CRLF/size sanitization, per-recipient
// rate limit) lives here so the deny/allow matrix is unit-testable.

export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "https://coffernode.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
])

/** Sends per recipient per rolling 60s window. */
export const RATE_LIMIT_PER_MINUTE = 2
export const MAX_RATE_BUCKETS = 10_000
export const RATE_WINDOW_MS = 60_000

export const SUBJECT_MAX_LENGTH = 200
export const TEXT_MAX_LENGTH = 5000
export const MAX_RECIPIENT_LENGTH = 320
export const RECIPIENT_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const rateBuckets = new Map<string, { count: number; resetAt: number }>()

/**
 * Best-effort per-recipient rate limit. Evicts expired entries and hard-caps
 * the map so it cannot grow unbounded. In-memory — under multiple isolates it
 * is per-isolate (documented limitation; layer real rate limiting with JWT).
 * `now` is injectable for deterministic tests; production never passes it.
 */
export function rateLimited(email: string, now: number = Date.now()): boolean {
  if (rateBuckets.size > MAX_RATE_BUCKETS) {
    for (const [k, v] of rateBuckets)
      if (v.resetAt <= now) rateBuckets.delete(k)
    if (rateBuckets.size > MAX_RATE_BUCKETS) rateBuckets.clear()
  }
 
  const bucket = rateBuckets.get(email)
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(email, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  bucket.count += 1
  return bucket.count > RATE_LIMIT_PER_MINUTE
}

/** Test-only: clear the in-memory buckets so suites run in isolation. */
export function resetEmailRateLimits(): void {
  rateBuckets.clear()
}

/** Strip CR/LF so no header-injection-style payload reaches the provider. */
export function sanitizeLine(value: string, maxLength: number): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, maxLength)
}

/** Whether a stored recipient address is plausibly a real email. */
export function isValidEmailTo(value: string): boolean {
  return RECIPIENT_RE.test(value) && value.length <= MAX_RECIPIENT_LENGTH
}
