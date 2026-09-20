/**
 * Client error-reporting domain logic: scrubbing, fingerprinting and
 * normalisation. Everything here is PURE and unit-tested
 * (`tests/error-logging.spec.ts`) — the self-installing wire-up in
 * `src/error-logger.ts` and the edge endpoint
 * (`functions/api/error-report.ts`) both build on these helpers.
 *
 * Privacy: this is a non-custodial P2P app. Raw error strings can carry
 * wallet addresses, tx hashes, token amounts or PII, so every report is
 * scrubbed HERE (client) and AGAIN at the edge before it touches Postgres.
 */

export type ErrorType =
  | "error"
  | "unhandledrejection"
  | "react_render"
  | "fetch_error"

export interface ErrorReport {
  fingerprint: string
  error_type: ErrorType
  message: string
  stack?: string
  source?: string
  line?: number
  col?: number
  route: string
  user_agent?: string
  language?: string
  count: number
  occurred_at: string
}

export interface RawReportInput {
  error?: unknown
  error_type?: ErrorType
  message?: string
  stack?: string
  source?: string
  line?: number
  col?: number
}

export const MAX_MESSAGE_LEN = 500
export const MAX_STACK_LEN = 4000
export const MAX_FINGERPRINT_LEN = 160

/** Mask identifiable values that routinely leak into error strings. */
export function scrubText(text: string): string {
  return (
    text
      // EVM addresses (40 hex) and tx hashes (64 hex) — longer first so a
      // 64-char hash isn't half-mangled by the 40-char rule.
      .replace(/\b0x[a-fA-F0-9]{64}\b/g, "0x…")
      .replace(/\b0x[a-fA-F0-9]{40}\b/g, "0x…")
      .replace(/\b0x[a-fA-F0-9]{36,}\b/g, "0x…")
      // Emails.
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]")
      // URL query params keep their names, lose their values.
      .replace(/([?&])([^=&]+)=[^&\s]+/g, "$1$2=[redacted]")
  )
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

/** Deterministic grouping key so the DB can coalesce occurrences. */
export function buildFingerprint(input: {
  error_type: string
  message: string
  source?: string
  route?: string
}): string {
  return truncate(
    [
      input.error_type,
      scrubText(String(input.message).trim()),
      input.source ?? "",
      input.route ?? "",
    ]
      .join("|")
      .toLowerCase(),
    MAX_FINGERPRINT_LEN
  )
}

/** Pull a one-line message out of an unknown rejection/error value. */
export function extractMessage(err: unknown): string {
  if (err == null) return "Unknown error"
  if (typeof err === "string") return err
  if (err instanceof Error) return err.message || err.name || "Error"
  if (typeof err === "object") {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === "string" && msg) return msg
    try {
      return JSON.stringify(err)
    } catch {
      return Object.prototype.toString.call(err)
    }
  }
  return String(err)
}

/** Normalise + scrub an incoming event into a report-ready shape. */
export function buildReport(
  input: RawReportInput,
  route: string,
  userAgent?: string,
  language?: string
): ErrorReport {
  const rawMessage = input.message ?? extractMessage(input.error)
  const message = truncate(scrubText(rawMessage), MAX_MESSAGE_LEN)
  const stack = input.stack
    ? truncate(scrubText(input.stack), MAX_STACK_LEN)
    : undefined

  return {
    fingerprint: buildFingerprint({
      error_type: input.error_type ?? "error",
      message,
      source: input.source,
      route,
    }),
    error_type: input.error_type ?? "error",
    message,
    stack,
    source: input.source ? truncate(scrubText(input.source), 300) : undefined,
    line: input.line,
    col: input.col,
    route,
    user_agent: userAgent ? truncate(userAgent, 300) : undefined,
    language: language ? truncate(language, 32) : undefined,
    count: 1,
    occurred_at: new Date().toISOString(),
  }
}
