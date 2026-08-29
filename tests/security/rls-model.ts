// RLS policy model — simulates the final RLS posture by replaying the
// migration files in order (create policy / drop policy / enable RLS /
// SECURITY DEFINER functions / the two dynamic do-$$ policy loops).
//
// The result drives tests/security/rls-policy.spec.ts, which asserts the
// allow/deny matrix per table × role × command that the migration set is
// supposed to implement (see docs/penetration-test-matrix.md §4).

import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

export type PolicyCmd = "all" | "select" | "insert" | "update" | "delete"

export interface Policy {
  name: string
  schema: string
  table: string
  cmd: PolicyCmd
  roles: string[]
  using: string
  check: string
  file: string
}

export interface SafeFunctionDef {
  name: string
  securityDefiner: boolean
  searchPath: boolean
  file: string
}

export interface RlsSnapshot {
  /** table → RLS enabled? */
  rlsEnabled: Map<string, boolean>
  /** `${schema}.${table}|${name}` → active policy */
  policies: Map<string, Policy>
  /** public tables without a single policy (fail-closed by default) */
  noPolicyTables: string[]
  /** function name → latest definition */
  functions: Map<string, SafeFunctionDef>
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations")

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
}

export function readMigration(file: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
}

// ─── statement splitter (paren-aware, $$-block aware) ────────────────────────

export function splitStatements(sql: string): string[] {
  const out: string[] = []
  let cur = ""
  let depth = 0
  let inString = false
  let inDollar = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (inDollar) {
      cur += ch
      if (ch === "$" && sql[i + 1] === "$") {
        inDollar = false
        i++
        cur += "$"
      }
      continue
    }
    if (ch === "$" && sql[i + 1] === "$") {
      inDollar = true
      cur += "$$"
      i++
      continue
    }
    if (inString) {
      cur += ch
      if (ch === "'") inString = false
      continue
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++
      cur += "\n"
      continue
    }
    if (ch === "'") {
      inString = true
      cur += ch
      continue
    }
    if (ch === "(") depth++
    else if (ch === ")") depth--
    else if (ch === ";" && depth === 0) {
      if (cur.trim()) out.push(cur.trim())
      cur = ""
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function takeParen(s: string): { content: string; rest: string } {
  const start = s.indexOf("(")
  if (start === -1) return { content: "", rest: s }
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === "(") depth++
    else if (s[i] === ")") {
      depth--
      if (depth === 0)
        return { content: s.slice(start + 1, i), rest: s.slice(i + 1) }
    }
  }
  return { content: s.slice(start + 1), rest: "" }
}

// ─── policy parsing ───────────────────────────────────────────────────────────

export function parseCreatePolicy(stmt: string, file: string): Policy | null {
  const m =
    /^create policy\s+(?:if not exists\s+)?(?:"([^"]+)"|([^" ]+))/i.exec(stmt)
  if (!m) return null
  const name = m[1] ?? m[2]

  const rest0 = stmt.slice(m[0].length)
  const onm = /\s+on\s+(?:(?:"?([\w]+)"?)\s*\.\s*)?(?:"?([\w]+)"?)/i.exec(rest0)
  if (!onm) return null
  const schema = (onm[1] ?? "public").toLowerCase()
  const table = onm[2].toLowerCase()
  const rest1 = rest0.slice(onm[0].length)

  const fm = /\s+for\s+(all|select|insert|update|delete)/i.exec(rest1)
  if (!fm) return null
  const cmd = fm[1].toLowerCase() as PolicyCmd
  const rest2 = rest1.slice(fm[0].length)

  const tm = /\s+to\s+/i.exec(rest2)
  if (!tm) return null
  const rest3 = rest2.slice(tm[0].length)
  const rolesM = /^\s*([\w\s,]+?)(?=\s*(?:using\b|with\s+check\b|$))/i.exec(
    rest3
  )
  if (!rolesM) return null
  const roles = rolesM[1]
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
  let rest4 = rest3.slice(rolesM[0].length)

  let using = ""
  if (/^\s*using\b/i.test(rest4)) {
    const swapped = rest4.replace(/^\s*using\b/i, "")
    const p = takeParen(swapped)
    using = p.content
    rest4 = p.rest
  }

  let check = ""
  const cm = /^\s*with\s+check\b/i.exec(rest4)
  if (cm) {
    const p = takeParen(rest4.slice(cm[0].length))
    check = p.content
  }

  return { name, schema, table, cmd, roles, using, check, file }
}

export function parseDropPolicy(
  stmt: string
): { name: string; schema: string; table: string } | null {
  const m =
    /^drop policy\s+(?:if exists\s+)?(?:"([^"]+)"|([^" ]+))\s+on\s+(?:(?:"?([\w]+)"?)\s*\.\s*)?(?:"?([\w]+)"?)/i.exec(
      stmt
    )
  if (!m) return null
  return {
    name: m[1] ?? m[2],
    schema: (m[3] ?? "public").toLowerCase(),
    table: m[4].toLowerCase(),
  }
}

// ─── dynamic do-$$ policy loops in the migration history ─────────────────────
// 20260814000001: creates permissive rls_{read,insert,update}_any_<t> for
// 7 tables via `foreach … array array['t1', …]` + format strings.
// 20260829000002: drops exactly those names for the same 7 tables.

const DYNAMIC_RLS_TABLES = [
  "disputes",
  "dispute_evidence",
  "trade_ratings",
  "reputation_scores",
  "reputation_points",
  "reputation_badges",
  "reputation_recent_stats",
]

export function dynamicLoopMatches(sql: string): boolean {
  return /\bforeach\s+\w+\s+in\s+array\s+array\s*\[/.test(sql)
}

function applyDynamicLoop(
  sql: string,
  file: string,
  policies: Map<string, Policy>,
  rlsEnabled: Map<string, boolean>
): void {
  if (!dynamicLoopMatches(sql)) return
  const createsPermissive = /format\(\s*['"]create policy/i.test(sql)
  const dropsPermissive = /format\(\s*['"]drop policy/i.test(sql)
  const enablesRls =
    /format\(\s*['"]alter table public\.%I enable row level security/i.test(sql)
  if (!createsPermissive && !dropsPermissive && !enablesRls) return

  for (const t of DYNAMIC_RLS_TABLES) {
    if (enablesRls) rlsEnabled.set(t, true)
    const key = (name: string) => `public.${t}|${name}`
    if (dropsPermissive) {
      policies.delete(key(`rls_read_any_${t}`))
      policies.delete(key(`rls_insert_any_${t}`))
      policies.delete(key(`rls_update_any_${t}`))
    }
    if (createsPermissive) {
      policies.set(key(`rls_read_any_${t}`), {
        name: `rls_read_any_${t}`,
        schema: "public",
        table: t,
        cmd: "select",
        roles: ["anon", "authenticated"],
        using: "true",
        check: "",
        file,
      })
      policies.set(key(`rls_insert_any_${t}`), {
        name: `rls_insert_any_${t}`,
        schema: "public",
        table: t,
        cmd: "insert",
        roles: ["anon", "authenticated"],
        using: "",
        check: "true",
        file,
      })
      policies.set(key(`rls_update_any_${t}`), {
        name: `rls_update_any_${t}`,
        schema: "public",
        table: t,
        cmd: "update",
        roles: ["anon", "authenticated"],
        using: "true",
        check: "true",
        file,
      })
    }
  }
}

// ─── SECURITY DEFINER function tracking ──────────────────────────────────────

const FN_RE =
  /create\s+(?:or\s+replace\s+)?function\s+(?:(?:"?[\w.]+"?)\.)?([\w.]+)\s*\(([\s\S]*?)\)\s*returns([\s\S]*?)\$\$/g
const DEFER_SENTINEL = /security\s+definer/i
const SEARCH_PATH_SENTINEL = /set\s+search_path\s*=\s*public/i

export function extractFunctions(file: string, sql: string): SafeFunctionDef[] {
  const defs: SafeFunctionDef[] = []
  for (const m of sql.matchAll(FN_RE)) {
    const name = m[1].toLowerCase()
    const body = m[0]
    const hasDefiner = DEFER_SENTINEL.test(body)
    defs.push({
      name,
      securityDefiner: hasDefiner,
      searchPath: hasDefiner ? SEARCH_PATH_SENTINEL.test(body) : false,
      file,
    })
  }
  return defs
}

// ─── replay ───────────────────────────────────────────────────────────────────

export function computeRlsSnapshot(files?: string[]): RlsSnapshot {
  const order = files ?? migrationFiles()
  const rlsEnabled = new Map<string, boolean>()
  const policies = new Map<string, Policy>()
  const functions = new Map<string, SafeFunctionDef>()
  const noPolicyTables = new Set<string>()

  for (const file of order) {
    const sql = readMigration(file)
    const stmts = splitStatements(sql)

    for (const stmt of stmts) {
      const create = parseCreatePolicy(stmt, file)
      if (create) {
        policies.set(`${create.schema}.${create.table}|${create.name}`, create)
        noPolicyTables.delete(create.table)
        continue
      }
      const drop = parseDropPolicy(stmt)
      if (drop) {
        policies.delete(`${drop.schema}.${drop.table}|${drop.name}`)
        continue
      }
      const rls = /\benable\s+row\s+level\s+security\b/i.exec(stmt)
      if (rls) {
        const m =
          /\b(?:alter|create)\s+table\s+(?:(?:"?([\w]+)"?)\s*\.\s*)?(?:"?([\w]+)"?)/i.exec(
            stmt
          )
        if (m) rlsEnabled.set(m[2].toLowerCase(), true)
      }
    }

    applyDynamicLoop(sql, file, policies, rlsEnabled)
    for (const def of extractFunctions(file, sql)) {
      functions.set(def.name, def)
    }
  }

  // Tables that have policies but never had RLS enabled are NOT fail-closed.
  const noPolicy: string[] = []
  for (const p of policies.values()) {
    if (!rlsEnabled.get(p.table)) {
      if (!noPolicy.includes(p.table)) noPolicy.push(p.table)
    }
  }

  return {
    rlsEnabled,
    policies,
    noPolicyTables: noPolicy,
    functions,
  }
}

export const CORE_TABLES = [
  "users",
  "offers",
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
  "trade_ratings",
  "reputation_scores",
  "reputation_points",
  "reputation_badges",
  "reputation_recent_stats",
  "siwe_nonces",
  "siwe_auth_links",
]

export const WRITE_COMMANDS: readonly PolicyCmd[] = [
  "insert",
  "update",
  "delete",
]
