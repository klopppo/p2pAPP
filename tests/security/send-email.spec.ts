// send-email edge function penetration checks.
//
// The only three things the function can be made to do are send an email, or
// not. This suite fixes the ALLOW / DENY split:
//   ALLOW — a same-origin request from the app for a stored user notification.
//   DENY  — foreign origins (hotlinking the edge URL), CRLF-injected payloads,
//           oversized subject/body, junk recipient addresses, and more than
//           RATE_LIMIT_PER_MINUTE sends per recipient per minute.

import { beforeEach, describe, expect, it } from "vitest"
import {
  ALLOWED_ORIGINS,
  isValidEmailTo,
  RATE_LIMIT_PER_MINUTE,
  RATE_WINDOW_MS,
  rateLimited,
  resetEmailRateLimits,
  sanitizeLine,
  SUBJECT_MAX_LENGTH,
  TEXT_MAX_LENGTH,
} from "../../supabase/functions/_shared/email-core"

describe("origin allowlist — who may call the function at all", () => {
  it("ALLOWS the app origins (prod + dev)", () => {
    expect(ALLOWED_ORIGINS.has("https://coffernode.app")).toBe(true)
    expect(ALLOWED_ORIGINS.has("http://localhost:5173")).toBe(true)
    expect(ALLOWED_ORIGINS.has("http://127.0.0.1:5173")).toBe(true)
  })

  it("DENIES every other origin (a crafted Referer/Origin cannot spoof a send)", () => {
    const denied = [
      "https://coffernode.app.evil.com",
      "https://evil.coffernode.app",
      "http://coffernode.app",
      "https://localhost:5173",
      "http://127.0.0.1:5174",
      "null",
      "https://example.com",
    ]
    for (const o of denied) expect(ALLOWED_ORIGINS.has(o), o).toBe(false)
    expect(ALLOWED_ORIGINS.size).toBe(3)
  })
})

describe("sanitizeLine — the CR/LF injection gate", () => {
  it("ALLOWS an ordinary subject/body untouched up to max length", () => {
    expect(sanitizeLine("hello world", SUBJECT_MAX_LENGTH)).toBe("hello world")
  })

  it("DENIES CR and LF from reaching the SMTP provider (header injection is collapsed)", () => {
    expect(
      sanitizeLine("subject\r\nBcc: attacker@evil.com", SUBJECT_MAX_LENGTH)
    ).toBe("subject Bcc: attacker@evil.com")
    expect(sanitizeLine("body\n\n--\nsig", TEXT_MAX_LENGTH)).not.toContain("\n")
    expect(sanitizeLine("a\rb", TEXT_MAX_LENGTH)).not.toContain("\r")
  })

  it("truncates oversized subject/body to hard limits", () => {
    expect(sanitizeLine("x".repeat(1000), SUBJECT_MAX_LENGTH).length).toBe(
      SUBJECT_MAX_LENGTH
    )
    expect(sanitizeLine("y".repeat(50_000), TEXT_MAX_LENGTH).length).toBe(
      TEXT_MAX_LENGTH
    )
  })
})

describe("isValidEmailTo — who can be a directive", () => {
  it("ALLOWS a normal lowercase address", () => {
    expect(isValidEmailTo("boss@coffernode.app")).toBe(true)
  })
  it("DENIES injected separators, missing tld, spaces and over-length addresses", () => {
    expect(isValidEmailTo("boss@evil.com\r\n\tBcc: a@b.c")).toBe(false)
    expect(isValidEmailTo("boss@coffernode")).toBe(false)
    expect(isValidEmailTo("boss @coffernode.app")).toBe(false)
    expect(isValidEmailTo("a".repeat(400) + "@coffernode.app")).toBe(false)
  })
})

describe("rateLimit — the per-recipient flood gate", () => {
  beforeEach(() => resetEmailRateLimits())

  it("ALLOWS the first N sends inside the window, DENIES the (N+1)th", () => {
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      expect(rateLimited("flood@coffernode.app")).toBe(false)
    }
    expect(rateLimited("flood@coffernode.app")).toBe(true)
  })

  it("rate limiting is per-recipient: one victim does not block a second", () => {
    for (let i = 0; i < 5; i++) rateLimited("victim@coffernode.app")
    expect(rateLimited("other@coffernode.app")).toBe(false)
  })

  it("window reset frees the recipient again", () => {
    const T0 = 1_752_000_000_000
    for (let i = 0; i < 5; i++) rateLimited("gated@coffernode.app", T0)
    expect(rateLimited("gated@coffernode.app", T0)).toBe(true)
    expect(rateLimited("gated@coffernode.app", T0 + RATE_WINDOW_MS + 1)).toBe(
      false
    )
  })
})
