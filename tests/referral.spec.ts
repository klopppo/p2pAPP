// Unit tests for the referral program shared logic (src/lib/referral.ts).
// These mirror the SQL twins in supabase/migrations/20260915000005_referral_program.sql
// — if the maths or the code format diverge, this spec fails.

import { describe, expect, it } from "vitest"
import {
  REFERRER_SHARE_BPS,
  isValidReferralCode,
  computePlatformFee,
  computeReferralEarnings,
  buildReferralUrl,
  savePendingReferral,
  consumePendingReferral,
  PENDING_REFERRAL_KEY,
} from "@/lib/referral"

describe("referral code format", () => {
  it("accepts exactly 8 uppercase or lowercase hex chars", () => {
    expect(isValidReferralCode("3F2A9C1B")).toBe(true)
    expect(isValidReferralCode("3f2a9c1b")).toBe(true)
    expect(isValidReferralCode("00000000")).toBe(true)
  })

  it("rejects wrong lengths, non-hex and empty codes", () => {
    for (const bad of ["", "AB", "ABCDEFGH", "3F2A9C1", "3F2A9C1BB", "3F2A9C1Z", "3F2A9C1B-", "!3F2A9C1"]) {
      expect(isValidReferralCode(bad), `code '${bad}' should be invalid`).toBe(false)
    }
  })

  it("trims surrounding whitespace (forgiving paste)", () => {
    expect(isValidReferralCode(" 3F2A9C1B ")).toBe(true)
  })
})

describe("fee + earnings maths (mirrors calculate_fee_split)", () => {
  it("platform fee = fiat * bps / 10000, rounded to 2dp", () => {
    // $100 at 50bps (0.5%) = $0.50
    expect(computePlatformFee(100, 50)).toBe(0.5)
    // $1000 at 50bps = $5.00
    expect(computePlatformFee(1000, 50)).toBe(5)
    // $333.33 at 100bps = $3.33 (round half away handled by float — assert toBeCloseTo)
    expect(computePlatformFee(333.33, 100)).toBeCloseTo(3.33, 2)
    // Zero fee offer
    expect(computePlatformFee(500, 0)).toBe(0)
  })

  it("referrer earnings = 15% of the platform fee by default", () => {
    expect(REFERRER_SHARE_BPS).toBe(1500)
    // $100 trade, 50bps fee → $0.50 fee → 15% = $0.075, rounded half-up
    // (Postgres `round(numeric, 2)` rounds 0.075 → 0.08 — the TS mirror
    // matches the SQL credit).
    expect(computeReferralEarnings(100, 50)).toBe(0.08)
    // $1000 trade, 50bps → $5.00 fee → $0.75
    expect(computeReferralEarnings(1000, 50)).toBeCloseTo(0.75, 2)
    // $2000 trade, 200bps (2%) → $40.00 fee → $6.00
    expect(computeReferralEarnings(2000, 200)).toBeCloseTo(6, 2)
  })

  it("respects a custom share for previews", () => {
    expect(computeReferralEarnings(1000, 50, 1200)).toBeCloseTo(0.6, 2)
    expect(computeReferralEarnings(1000, 50, 0)).toBe(0)
  })

  it("earnings never exceed the platform fee", () => {
    expect(computeReferralEarnings(100, 50)).toBeLessThanOrEqual(computePlatformFee(100, 50))
  })
})

describe("invite URL", () => {
  it("builds /r/CODE with the supplied origin and uppercases the code", () => {
    expect(buildReferralUrl("3f2a9c1b", "https://coffernode.io")).toBe(
      "https://coffernode.io/r/3F2A9C1B",
    )
  })
})

describe("pending referral attribution (localStorage)", () => {
  // node 18+ ships a localStorage shim only with the `happy-dom`/`jsdom`
  // env; here we save/consume is guarded to no-op without `window`, so we
  // assert the storage key + no-crash behaviour instead of real storage.
  it("uses a stable, namespaced storage key", () => {
    expect(PENDING_REFERRAL_KEY).toBe("coffernode:referral:pending")
  })

  it("is a safe no-op when there is no window (SSR / tests)", () => {
    expect(consumePendingReferral()).toBeNull()
    expect(savePendingReferral("3F2A9C1B")).toBeUndefined()
    expect(consumePendingReferral()).toBeNull()
  })
})