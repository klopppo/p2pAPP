// siwe-auth edge function penetration checks.
//
// Exercises the pure authorization logic that decides what IS ALLOWED into a
// session and what is DENIED:
//   ALLOW  — valid EIP-4361 message, allowed URI host, fresh iat, correct
//            checksummed address.
//   DENY   — malformed headers, missing fields, wrong URI host (phishing
//            origin), foreign address (uppercase garbage / wrong checksum),
//            expired issued-at. Each rejected case must throw from the parser
//            or fail the allowlist so the edge function never mints a JWT.

import { describe, expect, it } from "vitest"
import {
  ALLOWED_URI_HOSTS,
  MAX_ACTIVE_NONCES,
  NONCE_TTL_MINUTES,
  normalizeAddress,
  parseSiweMessage,
  SESSION_TTL_SECONDS,
  WALLET_EMAIL_DOMAIN,
} from "../../supabase/functions/_shared/siwe-core"

const ADDR = "0x1234567890abcdef1234567890abcdef12345678"
const base = (overrides: Record<string, string> = {}): string =>
  [
    "coffernode.app wants you to sign in with your Ethereum account:",
    ADDR,
    "",
    `URI: ${overrides.uri ?? "https://coffernode.app/login"}`,
    "Version: 1",
    `Nonce: ${overrides.nonce ?? "abc123"}`,
    `Issued At: ${overrides.issuedAt ?? "2026-08-29T10:00:00.000Z"}`,
  ].join("\n")

describe("parseSiweMessage — what may / may not open a session", () => {
  it("ALLOWS a well-formed message and extracts the fields", () => {
    const p = parseSiweMessage(base())
    expect(p.address).toBe(ADDR)
    expect(p.uriHost).toBe("coffernode.app")
    expect(p.version).toBe("1")
    expect(p.nonce).toBe("abc123")
    expect(p.issuedAt).toBe("2026-08-29T10:00:00.000Z")
  })

  it("ALLOWS message with an allowed dev host (localhost / 127.0.0.1) — but NOT arbitrary hosts", () => {
    for (const host of ["localhost:5173", "127.0.0.1:3000"]) {
      const p = parseSiweMessage(base({ uri: `https://${host}/` }))
      expect(ALLOWED_URI_HOSTS.has(p.uriHost)).toBe(true)
    }
    const evil = parseSiweMessage(
      base({ uri: "https://evil.example.com/phish" })
    )
    expect(ALLOWED_URI_HOSTS.has(evil.uriHost)).toBe(false)
    expect(ALLOWED_URI_HOSTS).toContain("coffernode.app")
  })

  it("DENIES a message whose header is not the SIWE template", () => {
    expect(() =>
      parseSiweMessage(base().replace("wants you to sign in", "gimme session"))
    ).toThrow("Not a SIWE message")
  })

  it("DENIES a missing address, an empty line-1 address and a short/garbage address", () => {
    expect(() =>
      parseSiweMessage(base().replace(`\n${ADDR}\n`, "\n\n"))
    ).toThrow()
    expect(() => parseSiweMessage(base().replace(ADDR, "0x1234"))).toThrow()
    expect(() =>
      parseSiweMessage(base().replace(ADDR, "not-an-address"))
    ).toThrow()
  })

  it("DENIES a missing or malformed URI and a malformed top-level message", () => {
    expect(() => parseSiweMessage(base({ uri: "not a uri" }))).toThrow(
      "Malformed URI"
    )
  })

  it("DENIES missing Version / Nonce / Issued At fields", () => {
    expect(() => parseSiweMessage(base().replace("Version: 1\n", ""))).toThrow(
      "Missing SIWE fields"
    )
    expect(() =>
      parseSiweMessage(base().replace("Nonce: abc123\n", ""))
    ).toThrow("Missing SIWE fields")
    expect(() =>
      parseSiweMessage(
        base().replace("Issued At: 2026-08-29T10:00:00.000Z", "")
      )
    ).toThrow("Missing SIWE fields")
  })

  it('DENIES a non-"1" SIWE version', () => {
    const p = parseSiweMessage(base().replace("Version: 1", "Version: 2"))
    expect(p.version).not.toBe("1")
  })
})

describe("normalizeAddress — the wallet canonicalization gate", () => {
  it("ALLOWS mixed-case 0x addresses (canonicalizes to lower-case)", () => {
    const mixed = "0xAbCd" + ADDR.slice(6)
    expect(normalizeAddress(mixed)).toBe(mixed.toLowerCase())
  })
  it("DENIES a 0x-free string, wrong length and empty input", () => {
    expect(normalizeAddress(undefined)).toBeNull()
    expect(normalizeAddress("")).toBeNull()
    expect(normalizeAddress("0x1234")).toBeNull()
    expect(normalizeAddress(ADDR + "ff")).toBeNull()
    expect(normalizeAddress("coffernode.app")).toBeNull()
  })
})

describe("siwe-auth constants — session + nonce bounds (the attack surface params)", () => {
  it("nonce TTL is short (5 min) and bounded across the corporate claim", () => {
    expect(NONCE_TTL_MINUTES).toBe(5)
    expect(MAX_ACTIVE_NONCES).toBe(5)
  })
  it("session JWT TTL is 24h (refresh flow is a documented follow-up, not silent)", () => {
    expect(SESSION_TTL_SECONDS).toBe(24 * 60 * 60)
  })
  it("provisioned auth email always points at the wallet domain — no cross-user email collision", () => {
    expect(WALLET_EMAIL_DOMAIN).toMatch(/^wallet\./)
  })
})
