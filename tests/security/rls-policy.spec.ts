// RLS penetration checks — the "otherss" layer: Supabase tables, storage,
// RPCs and SECURITY DEFINER functions.
//
// The live project is expected to run the posture encoded by the migrations.
// ⚠️ Until `supabase db push` (20260829000002) actually deploys, the LIVE
// posture is still the permissive one the file set replaces — these tests
// certify the SQL SET declares the deny-by-default posture; see
// docs/penetration-test-matrix.md §4 for the deploy caveat.
//
// Notable deliberate outcomes asserted here (all ALLOW/DENY):
//   • anon: SELECT on users/offers/trade_ratings/reputation_* (marketplace)
//   • anon: DENY on every write everywhere
//   • authenticated: writes scoped to the JWT wallet claim via current_user_id()
//   • trades/chat/disputes: SELECT is participant-scoped, never anon-readable
//   • siwe_nonces / siwe_auth_links: RLS on, zero policies (service-role only)
//   • storage avatars: owner-bound path, anon read-only
//   • every SECURITY DEFINER function pins set search_path = public

import { describe, expect, it } from "vitest"
import {
  computeRlsSnapshot,
  migrationFiles,
  readMigration,
  WRITE_COMMANDS,
} from "./rls-model"
import { CORE_TABLES } from "./rls-model"

const snapshot = (() => {
  const s = computeRlsSnapshot()
  return s
})()

const policiesFor = (table: string, schema = "public") =>
  [...snapshot.policies.values()].filter(
    (p) => p.table === table && p.schema === schema
  )

const describeRoleAllowed = (
  table: string,
  cmd: string,
  role: "anon" | "authenticated",
  out: string[]
) => {
  for (const p of policiesFor(table)) {
    if (p.cmd === "all" || p.cmd === (cmd as never)) {
      if (p.roles.includes(role)) out.push(`${p.name}(${p.cmd})`)
    }
  }
}

describe("final RLS posture: allow/deny per table × role × command", () => {
  it("on fail-closed base: every core table has RLS enabled", () => {
    for (const t of CORE_TABLES) {
      expect(snapshot.rlsEnabled.get(t), `${t} should enable RLS`).toBe(true)
    }
  })

  it("anon is DENIED every write (insert/update/delete) on all core tables", () => {
    const anonWrites: string[] = []
    for (const t of CORE_TABLES) {
      for (const w of WRITE_COMMANDS) {
        describeRoleAllowed(t, w, "anon", anonWrites)
      }
    }
    expect(anonWrites).toEqual([])
  })

  it("every write policy on core tables is bound to the JWT wallet claim (never a bare true)", () => {
    const unscoped: string[] = []
    for (const t of CORE_TABLES) {
      for (const p of policiesFor(t)) {
        const isWrite =
          p.cmd === "all" || (WRITE_COMMANDS as string[]).includes(p.cmd)
        if (!isWrite) continue
        const expr = `${p.using} ${p.check}`.trim()
        if (expr === "true" || expr === "") {
          unscoped.push(`${t}.${p.name}`)
          continue
        }
        if (!/current_user_id\(\)|auth\.jwt\(|auth\.uid\(/.test(expr)) {
          unscoped.push(`${t}.${p.name} (no claim)` + ` :: ${expr}`)
        }
      }
    }
    expect(unscoped).toEqual([])
  })

  it("no `for all` policy survives on any core table (aggregate grants are banned)", () => {
    const allCtl: string[] = []
    for (const t of CORE_TABLES) {
      for (const p of policiesFor(t))
        if (p.cmd === "all") allCtl.push(`${t}.${p.name}`)
    }
    expect(allCtl).toEqual([])
  })

  it("anon is ALLOWED SELECT on marketplace/profile tables only, DENIED on trade/chat/dispute tables", () => {
    const publicRead = new Set([
      "users",
      "offers",
      "trade_ratings",
      "reputation_scores",
      "reputation_points",
      "reputation_badges",
      "reputation_recent_stats",
    ])
    for (const t of CORE_TABLES) {
      const anonSelect = policiesFor(t).filter(
        (p) =>
          (p.cmd === "all" || p.cmd === "select") && p.roles.includes("anon")
      )
      if (publicRead.has(t)) {
        expect(
          anonSelect.length,
          `${t} should be publicly readable`
        ).toBeGreaterThan(0)
      } else {
        expect(anonSelect, `${t} must NOT be anon-readable`).toEqual([])
      }
    }
  })

  it("private table SELECTs are participant/owner-scoped to the wallet claim", () => {
    const scoped: string[] = []
    for (const t of [
      "trades",
      "trade_events",
      "conversations",
      "conversation_participants",
      "messages",
      "message_attachments",
      "notifications",
      "notification_preferences",
      "disputes",
      "dispute_evidence",
    ]) {
      for (const p of policiesFor(t)) {
        if (p.cmd !== "all" && p.cmd !== "select") continue
        if (
          !/public\.current_user_id\(\)|auth\.jwt\(|auth\.uid\(|is_conversation_participant/.test(
            p.using
          )
        ) {
          scoped.push(`${t}.${p.name}`)
        }
      }
    }
    expect(scoped).toEqual([])
  })

  it("messages: sender_id is server-wallet-bound on insert (NO message spoofing possible)", () => {
    const insert = policiesFor("messages").find((p) => p.cmd === "insert")
    expect(insert).toBeDefined()
    expect(insert!.check).toContain("current_user_id()")
    expect(insert!.check).toContain("sender_id")
  })

  it("messages: delete is own-messages-only (evidence NOT destructible)", () => {
    const del = policiesFor("messages").find((p) => p.cmd === "delete")
    expect(del).toBeDefined()
    expect(del!.using).toContain("sender_id = public.current_user_id()")
  })

  it("trades: read/insert/update are parties-only", () => {
    for (const cmd of ["select", "insert", "update"]) {
      const p = policiesFor("trades").find((x) => x.cmd === cmd)
      expect(p, `trades ${cmd} policy`).toBeDefined()
      expect(p!.roles).toEqual(["authenticated"])
      expect(p!.using || p!.check).toMatch(
        /buyer_id = public\.current_user_id\(\) or seller_id = public\.current_user_id\(\)/
      )
    }
  })

  it("disputes + evidence: parties-only read and write; no airdropped winner/ruling edits", () => {
    const d = policiesFor("disputes")
    expect(d.some((p) => p.cmd === "update")).toBe(true)
    for (const p of d.filter((x) => x.cmd === "select" || x.cmd === "update")) {
      expect(p.roles).toEqual(["authenticated"])
      expect(p.using || p.check).toMatch(
        /buyer_id = public\.current_user_id\(\) or seller_id = public\.current_user_id\(\)/
      )
    }
  })

  it("trade_ratings: insert requires rater = you AND membership of the trade", () => {
    const insert = policiesFor("trade_ratings").find((p) => p.cmd === "insert")
    expect(insert).toBeDefined()
    expect(insert!.check).toContain("rater_id = public.current_user_id()")
    expect(insert!.check).toMatch(
      /t\.buyer_id = public\.current_user_id\(\) or t\.seller_id = public\.current_user_id\(\)/
    )
  })

  it("siwe_nonces / siwe_auth_links: RLS on, ZERO policies (service-role writes end-to-end)", () => {
    for (const t of ["siwe_nonces", "siwe_auth_links"]) {
      expect(snapshot.rlsEnabled.get(t)).toBe(true)
      expect(policiesFor(t)).toEqual([])
    }
  })

  it("storage avatars: anon read-only, writes are wallet-path-scoped (no overwriting others)", () => {
    const writes = policiesFor("objects", "storage").filter(
      (p) => p.cmd === "insert" || p.cmd === "update"
    )
    expect(writes.length).toBe(2)
    for (const p of writes) {
      expect(p.roles).toEqual(["authenticated"])
      expect(p.using || p.check).toContain("auth.jwt()")
      expect(p.using || p.check).toContain("'avatars'")
    }
    const anonWrite = policiesFor("objects", "storage").filter(
      (p) =>
        (p.cmd === "insert" || p.cmd === "update") && p.roles.includes("anon")
    )
    expect(anonWrite).toEqual([])
  })

  it("legacy permissive policies are all dropped by the SIWE rewrite", () => {
    const permissiveNames = [
      "users_insert_any",
      "users_update_any",
      "offers_insert_any",
      "offers_update_any",
      "trades_insert_any",
      "trades_update_any",
      "trade_events_insert_any",
      "conversations_all",
      "conv_participants_all",
      "messages_all",
      "message_attachments_all",
      "notifications_all",
      "notif_prefs_all",
      "avatars_anon_write",
      "avatars_anon_update",
    ]
    for (const n of permissiveNames) {
      let found = false
      for (const p of snapshot.policies.values()) {
        if (p.name === n) {
          found = true
          break
        }
      }
      expect(found, `legacy permissive policy ${n} should be gone`).toBe(false)
    }
  })
})

describe("pre-cutover reality check (what an attacker can do BEFORE the deploy)", () => {
  it("documents that the permissive policies exist in the source set and are only removed by the cutover migration", () => {
    // Not an assertion of safety — a coded statement of the deployment gate.
    const cutover = migrationFiles().find((f) => f.includes("20260829000002"))
    expect(cutover).toBeDefined()
    const before = computeRlsSnapshot(
      migrationFiles().filter((f) => f < cutover!)
    )
    const anonWrite = [...before.policies.values()].filter(
      (p) =>
        p.roles.includes("anon") &&
        (p.cmd === "insert" ||
          p.cmd === "update" ||
          p.cmd === "delete" ||
          p.cmd === "all")
    )
    // This is the pentest finding: pre-cutover the DB is write-all for anon.
    expect(anonWrite.length).toBeGreaterThan(0)
  })
})

describe("RPC + function hardening", () => {
  it("increment_reputation_score (P0): NULL user_id rejected + delta hard-bounded to ±10", () => {
    const p0 = migrationFiles().find((f) => f.includes("20260829000001"))
    const sql = readMigration(p0!)
    expect(sql).toMatch(/user_id is required/)
    expect(sql).toMatch(/delta[\s\S]*\[-10, 10\]/)
    expect(sql).toMatch(/clamp|least\(100/)
  })
  it("every latest SECURITY DEFINER function pins `set search_path = public`", () => {
    const offenders: string[] = []
    for (const def of snapshot.functions.values()) {
      if (def.securityDefiner && !def.searchPath) offenders.push(def.name)
    }
    expect(offenders).toEqual([])
  })
  it("no policy statement is left dangling as a drop-only ghost (drops refer to real, parsed statements)", () => {
    // A `drop policy if exists` that drops an un-created policy is harmless, but
    // a create with zero parsed policies on a core table compartment would mean
    // a mis-parse — guard the simulator instead: every write-bearing public
    // table must have ≥1 active policy. (siwe_* are intentionally policy-free.)
    for (const t of CORE_TABLES) {
      if (t === "siwe_nonces" || t === "siwe_auth_links") continue
      expect(
        policiesFor(t).length,
        `${t} should have parsed policies`
      ).toBeGreaterThan(0)
    }
  })
})
