// Referral program RLS + SQL assentations.
//
// Verifies the posture declared by
// supabase/migrations/20260915000005_referral_program.sql:
//   • RLS on, owner-scoped SELECTs only, no client writes anywhere
//   • anon cannot read the referral tables at all
//   • the credit path is server-only (SECURITY DEFINER trigger) and un-granted
//   • the SQL reward maths mirrors src/lib/referral.ts

import { describe, expect, it } from "vitest"
import { computeRlsSnapshot, migrationFiles } from "./rls-model"
import { readMigration } from "./rls-model"
import { REFERRER_SHARE_BPS, computeReferralEarnings } from "@/lib/referral"

const REFERRAL_TABLES = [
  "referral_codes",
  "referral_relations",
  "referral_fee_events",
]

const refMigration = (): string => {
  const f = migrationFiles().find((name) => name.includes("referral_program"))
  expect(f, "referral migration present in the file set").toBeDefined()
  return readMigration(f!)
}

const snapshot = computeRlsSnapshot()

const policiesFor = (table: string) =>
  [...snapshot.policies.values()].filter(
    (p) => p.table === table && p.schema === "public",
  )

describe("referral tables: owner-scoped, fail-closed RLS", () => {
  for (const t of REFERRAL_TABLES) {
    it(`${t}: RLS enabled with a scoped SELECT policy and zero client writes`, () => {
      expect(snapshot.rlsEnabled.get(t)).toBe(true)

      const selects = policiesFor(t).filter(
        (p) => p.cmd === "select" || p.cmd === "all",
      )
      expect(selects.length).toBeGreaterThanOrEqual(1)
      for (const p of selects) {
        expect(p.roles).toEqual(["authenticated"])
        expect(
          p.using,
          `${t}.${p.name} must be wallet-claim scoped`,
        ).toMatch(/current_user_id\(\)/)
      }

      const writes = policiesFor(t).filter(
        (p) => p.cmd === "insert" || p.cmd === "update" || p.cmd === "delete",
      )
      expect(writes, `${t} must have no client write policies`).toEqual([])
    })

    it(`${t}: anon is denied everything`, () => {
      const anonPols = policiesFor(t).filter(
        (p) => p.roles.includes("anon") && p.roles.includes("authenticated"),
      )
      const anonOnly = policiesFor(t).filter(
        (p) => p.roles.includes("anon") && !p.roles.includes("authenticated"),
      )
      expect([...anonPols, ...anonOnly]).toEqual([])
    })
  }
})

describe("referral SQL: server-only credit + maths mirror", () => {
  it("writes are RPC/trigger-only — credit_referral_fee is never granted to client roles", () => {
    const sql = refMigration()
    // The only grant lines in the migration target get_or_create + claim.
    expect(sql).toMatch(/grant execute on function public\.get_or_create_referral_code\(\)\s+to authenticated/)
    expect(sql).toMatch(/grant execute on function public\.claim_referral\(varchar\)\s+to authenticated/)
    // credit_referral_fee must NOT appear in a grant clause.
    expect(sql).not.toMatch(/grant execute on function public\.credit_referral_fee/)
    // The automatic path exists.
    expect(sql).toMatch(/escrow_status = 'released'/)
  })

  it("shares are computed on escrow RELEASE only, idempotently (UNIQUE trade_id)", () => {
    const sql = refMigration()
    expect(sql).toMatch(/trade_id\s+uuid not null unique/)
    expect(sql).toMatch(/on conflict \(trade_id\) do nothing/)
  })

  it("the default share constant in SQL matches the TS mirror", () => {
    const sql = refMigration()
    // calculate_fee_split default share bps == REFERRER_SHARE_BPS
    expect(sql).toMatch(/p_referrer_share_bps\s+int\s+default\s+1500/)
    expect(REFERRER_SHARE_BPS).toBe(1500)
  })

  it("per-trade earnings computed identically by SQL and src/lib/referral.ts", () => {
    // Grab the exact formula fragment from calculate_fee_split and assert it
    // implements the same math as computeReferralEarnings for a sample trade.
    const sql = refMigration()
    const frac =
      /round\(\s*\(p_fiat_amount \* p_fee_bps\) \/ 10000\.0,\s*2\s*\)/.exec(sql)
    expect(frac, "fee numerator must be fiat*bps/10000").toBeTruthy()

    const trade = 1000
    const feeBps = 50
    const expectEarned = computeReferralEarnings(trade, feeBps)
    expect(expectEarned).toBe(0.75)
    // 15% of a $5.00 fee
    expect(expectEarned).toBeCloseTo(5 * (1500 / 10000), 10)

    // The SQL second array element is round(fee * share_bps / 10000, 2)
    expect(sql).toMatch(/p_referrer_share_bps\) \/ 10000\.0,\s*2/)
  })
})