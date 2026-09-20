// Unit tests for the edge cache-key derivation (functions/_lib/cache-key.ts).
//
// These pin the contract the middleware relies on: every route gets a cache
// key bound to the request's session cookie, missing/malformed cookies fall
// back to `anon`, and identical inputs always produce identical keys.

import { describe, expect, it } from "vitest"
import {
  ANON_IDENTITY,
  SESSION_COOKIE_NAME,
  cookieIdentity,
  parseCookies,
  routeCacheKey,
} from "../functions/_lib/cache-key"

const WALLET = "0xabc123def456abc123def456abc123def456abcd"

describe("parseCookies", () => {
  it("returns an empty map for null / empty headers", () => {
    expect(parseCookies(null)).toEqual({})
    expect(parseCookies("")).toEqual({})
  })

  it("splits a multi-cookie header", () => {
    const cookies = parseCookies(`lang=en; ${SESSION_COOKIE_NAME}=${WALLET}; theme=dark`)
    expect(cookies[SESSION_COOKIE_NAME]).toBe(WALLET)
    expect(cookies.lang).toBe("en")
    expect(cookies.theme).toBe("dark")
  })

  it("tolerates whitespace and empty segments", () => {
    const cookies = parseCookies(`  ${SESSION_COOKIE_NAME} =  ${WALLET}  ;; lang=it `)
    expect(cookies[SESSION_COOKIE_NAME]).toBe(WALLET)
    expect(cookies.lang).toBe("it")
  })

  it("ignores segments without '=' or without a value", () => {
    expect(parseCookies(`${SESSION_COOKIE_NAME}; =junk`)).toEqual({})
    expect(parseCookies(`${SESSION_COOKIE_NAME}=`)).toEqual({})
  })
})

describe("cookieIdentity", () => {
  it("treats a missing mirror cookie as anon", () => {
    expect(cookieIdentity(null)).toBe(ANON_IDENTITY)
    expect(cookieIdentity("lang=en")).toBe(ANON_IDENTITY)
  })

  it("resolves a well-formed wallet cookie (lowercased)", () => {
    expect(cookieIdentity(`${SESSION_COOKIE_NAME}=${WALLET}`)).toBe(WALLET)
    expect(cookieIdentity(`${SESSION_COOKIE_NAME}=${WALLET.toUpperCase()}`)).toBe(WALLET)
  })

  it("collapses malformed / non-evm values to anon", () => {
    for (const bad of [
      (SESSION_COOKIE_NAME) + "=",
      `${SESSION_COOKIE_NAME}="injection; x=1"`,
      `${SESSION_COOKIE_NAME}=not-an-address`,
      `${SESSION_COOKIE_NAME}=0x123`, // too short
      `${SESSION_COOKIE_NAME}=%ZZ`, // bad percent-encoding
      `${SESSION_COOKIE_NAME}=0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG`, // non-hex
    ]) {
      expect(cookieIdentity(bad), `header '${bad}' should be anon`).toBe(ANON_IDENTITY)
    }
  })
})

describe("routeCacheKey", () => {
  it("is deterministic for an identical input", async () => {
    const header = `${SESSION_COOKIE_NAME}=${WALLET}`
    const a = await routeCacheKey("/app/offers", header)
    const b = await routeCacheKey("/app/offers", header)
    expect(a).toBe(b)
  })

  it("varies per route for the same identity", async () => {
    const header = `${SESSION_COOKIE_NAME}=${WALLET}`
    const offers = await routeCacheKey("/app/offers", header)
    const trades = await routeCacheKey("/app/trades", header)
    expect(offers).not.toBe(trades)
  })

  it("varies per identity for the same route", async () => {
    const headerA = `${SESSION_COOKIE_NAME}=${WALLET}`
    const headerB = `${SESSION_COOKIE_NAME}=0x111122223333444455556666777788889999aaaa`
    const a = await routeCacheKey("/app/profile", headerA)
    const b = await routeCacheKey("/app/profile", headerB)
    expect(a).not.toBe(b)
  })

  it("falls back to the anon slot on a missing/garbage cookie", async () => {
    const gutter = await routeCacheKey("/app/offers", `${SESSION_COOKIE_NAME}=; motif=x`)
    const clean = await routeCacheKey("/app/offers", null)
    expect(gutter).toBe(clean)
  })

  it("embeds the route but never a raw identity", async () => {
    const key = await routeCacheKey("/app/profile/0xabc", `${SESSION_COOKIE_NAME}=${WALLET}`)
    expect(key.startsWith("ck:v1:/app/profile/0xabc:")).toBe(true)
    expect(key.toLowerCase()).not.toContain(WALLET.toLowerCase())
    // identity contributes exactly a 16-hex sha256 prefix
    expect(key.replace("ck:v1:/app/profile/0xabc:", "")).toMatch(/^[0-9a-f]{16}$/)
  })
})