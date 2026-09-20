import {
  buildReport,
  type ErrorReport,
  type RawReportInput,
} from "@/lib/errorReports"

// Self-installing client error reporter (ADR-013).
//
// Subscribes to `window` `error` / `unhandledrejection`, dedupes identical
// fingerprints within a flush window, scrubs them, and POSTs the batch to
// the edge endpoint `/api/error-report` with `keepalive` so reports on page
// unload aren't dropped. Nothing leaves the browser in dev; in production
// it can be disabled with `VITE_ERROR_REPORT=0` (build-time).
//
// React render errors are caught by `AppErrorBoundary` (src/components/
// ErrorBoundary.tsx), which calls `reportError(...)` exported below.

const ENABLED =
  import.meta.env.PROD && import.meta.env.VITE_ERROR_REPORT !== "0"
const FLUSH_MS = 2000
const MAX_QUEUE = 40

const queue: ErrorReport[] = []
const indexByFingerprint = new Map<string, number>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

function enqueue(report: ErrorReport): void {
  const existing = indexByFingerprint.get(report.fingerprint)
  if (existing !== undefined && existing < queue.length) {
    queue[existing]!.count += 1
    return
  }
  if (queue.length >= MAX_QUEUE) queue.shift()
  indexByFingerprint.clear() // dropped rows invalidate every index — cheap rebuild
  for (let i = 0; i < queue.length; i += 1)
    indexByFingerprint.set(queue[i]!.fingerprint, i)
  indexByFingerprint.set(report.fingerprint, queue.length)
  queue.push(report)
  scheduleFlush()
}

function reEnqueue(reports: ErrorReport[]): void {
  for (const r of reports) enqueue(r)
}

function send(buffer: ErrorReport[]): void {
  const body = JSON.stringify({ reports: buffer })
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/error-report",
      new Blob([body], { type: "application/json" })
    )
    return
  }
  fetch("/api/error-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  })
    .catch(() => reEnqueue(buffer))
    .then((res) => {
      if (res && !res.ok) reEnqueue(buffer)
    })
}

function flush(): void {
  flushTimer = undefined
  if (queue.length === 0) return
  const buffer = queue.splice(0, queue.length)
  indexByFingerprint.clear()
  send(buffer)
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(flush, FLUSH_MS)
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event: ErrorEvent) => {
    // Skip resource-load errors (missing img/script) — they're browser
    // noise, not application failures, and would flood the log.
    if (event.error == null && event.target != null) return
    const report = buildReport(
      {
        error: event.error ?? undefined,
        message:
          typeof event.message === "string" && event.message
            ? event.message
            : undefined,
        source: event.filename,
        line: event.lineno,
        col: event.colno,
        error_type: "error",
      },
      window.location.pathname,
      navigator.userAgent,
      navigator.language
    )
    enqueue(report)
  })

  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      const report = buildReport(
        { error: event.reason, error_type: "unhandledrejection" },
        window.location.pathname,
        navigator.userAgent,
        navigator.language
      )
      enqueue(report)
    }
  )

  // Unload visibility transitions flush immediately (beacon keeps the POST alive).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush()
  })
  window.addEventListener("pagehide", flush)
}

/**
 * Manual report for React error boundaries and explicit catch sites.
 * Dev builds no-op; production forwards a scrubbed batch to the edge.
 */
export function reportError(input: RawReportInput): void {
  if (!ENABLED || typeof window === "undefined") return
  enqueue(
    buildReport(
      input,
      window.location.pathname,
      navigator.userAgent,
      navigator.language
    )
  )
}
