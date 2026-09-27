// Client error reporting endpoint (ADR-013).
//
// The SPA batches scrubbed error reports to POST /api/error-report. This
// worker (1) re-scrubs defensively (a compromised client must not be able to
// ship PII to Postgres), (2) rate-limits per source IP to bound abuse, and
// (3) appends to `error_logs` through the same SUPABASE_READ_KEY the other
// edge endpoints use — RLS lets `anon` INSERT but read NOTHING.
//
// Rate limiting is an in-memory per-isolate bucket: a one-file approximation
// good enough for a first pass (each isolated worker counts its own traffic).
// Move to KV/Durable Objects if a single worker sees sustained abuse.

import type { EdgeEnv } from "../_lib/supabase-rest"

const MAX_REPORTS_PER_REQUEST = 20
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX_PER_IP = 100
const ALLOWED_TYPES = new Set([
  "error",
  "unhandledrejection",
  "react_render",
  "fetch_error",
])

// Aligned with src/lib/errorReports.ts scrubText — keep the two in sync.
function scrub(text: string): string {
  return text
    .replace(/0x[a-fA-F0-9]{64}/g, "0x…")
    .replace(/0x[a-fA-F0-9]{40}/g, "0x…")
    .replace(/0x[a-fA-F0-9]{36,}/g, "0x…")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]")
    .replace(/([?&])([^=&]+)=[^&\s]+/g, "$1$2=[redacted]")
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined
  const s = v.trim()
  if (s.length === 0) return undefined
  return s.length > max ? `${s.slice(0, max)}…` : s
}

interface Bucket {
  resetAt: number
  count: number
}
const rateBuckets = new Map<string, Bucket>()

function allow(ip: string): boolean {
  const now = Date.now()
  // Opportunistically evict expired buckets: without this a long-lived isolate
  // accumulates one entry per unique IP forever (unbounded memory).
  if (rateBuckets.size > 1000) {
    for (const [key, b] of rateBuckets) {
      if (now >= b.resetAt) rateBuckets.delete(key)
    }
  }
  const bucket = rateBuckets.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { resetAt: now + RATE_WINDOW_MS, count: 1 })
    return true
  }
  bucket.count += 1
  return bucket.count <= RATE_MAX_PER_IP
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

export const onRequestPost = async ({
  request,
  env,
}: {
  request: Request
  env: EdgeEnv
}): Promise<Response> => {
  if (!env.SUPABASE_URL || !env.SUPABASE_READ_KEY) {
    return json({ error: "report endpoint not configured" }, 500)
  }

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "unknown"
  if (!allow(ip)) {
    return json({ error: "rate limit exceeded" }, 429)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return json({ error: "invalid json body" }, 400)
  }

  const rawReports = (payload as { reports?: unknown })?.reports
  if (!Array.isArray(rawReports) || rawReports.length === 0) {
    return json({ error: "missing reports[]" }, 400)
  }

  const rows: Record<string, unknown>[] = []
  for (const raw of rawReports.slice(0, MAX_REPORTS_PER_REQUEST)) {
    if (typeof raw !== "object" || raw === null) continue
    const r = raw as Record<string, unknown>

    const fingerprint = str(r.fingerprint, 160)
    const message = str(r.message, 500)
    if (!fingerprint || !message) continue
    const error_type =
      typeof r.error_type === "string" && ALLOWED_TYPES.has(r.error_type)
        ? r.error_type
        : "error"

    const row: Record<string, unknown> = {
      fingerprint: scrub(fingerprint),
      error_type,
      message: scrub(message),
      count:
        typeof r.count === "number" && Number.isInteger(r.count)
          ? Math.min(Math.max(r.count, 1), 1000)
          : 1,
    }

    const stack = str(r.stack, 4000)
    if (stack) row.stack = scrub(stack)
    const source = str(r.source, 300)
    if (source) row.source = scrub(source)
    ;["line", "col"].forEach((k) => {
      const v = r[k]
      if (typeof v === "number" && Number.isInteger(v)) row[k] = v
    })
    const route = str(r.route, 300)
    if (route) row.route = scrub(route)
    const user_agent = str(r.user_agent, 300)
    if (user_agent) row.user_agent = user_agent
    const language = str(r.language, 32)
    if (language) row.language = language
    const occurred_at = str(r.occurred_at, 48)
    if (occurred_at && !Number.isNaN(Date.parse(occurred_at)))
      row.occurred_at = occurred_at

    rows.push(row)
  }

  if (rows.length === 0) return json({ error: "no valid reports" }, 400)

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/error_logs`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_READ_KEY,
        authorization: `Bearer ${env.SUPABASE_READ_KEY}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
    })
    if (!res.ok) {
      console.error(`[error-report] insert -> ${res.status} ${res.statusText}`)
      return json({ error: "insert failed" }, 502)
    }
  } catch (err) {
    console.error("[error-report] insert threw:", err)
    return json({ error: "insert failed" }, 502)
  }

  return new Response(null, { status: 204 })
}
