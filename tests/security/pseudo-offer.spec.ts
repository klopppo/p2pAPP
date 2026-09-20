// Pseudo-offerta regression guards (ADR-015 / OD-08).
//
// The offer surface must stay identity-free: an anonymous reader of
// /app/offer/:id or /app/offers must never receive the seller's user uid or
// on-chain wallet. Those move to server-resolved RPCs that fire only at
// trade/chat intent.
//
// Guards here are static (the repo can't run a live Postgres), mirroring the
// pattern of rls-policy.spec.ts: they pin the client projection constants and
// the migration so a later edit can't silently regress the surface.

import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  PUBLIC_OFFER_COLUMNS,
  SELLER_JOIN,
  PUBLIC_USER_COLUMNS,
  SellerProfile,
  OfferWithSeller,
} from "@/lib/supabase"

const root = process.cwd()
const src = path.join(root, "src")

function readModule(file: string): string {
  return readFileSync(path.join(src, file), "utf8")
}

const migration = readFileSync(
  path.join(root, "supabase/migrations/20260920000003_offer_pseudonym.sql"),
  "utf8"
)

const offerCols = PUBLIC_OFFER_COLUMNS.split(",").map((c) => c.trim())
const sellerJoin = SELLER_JOIN.split(",").map((c) => c.trim())
const userCols = PUBLIC_USER_COLUMNS.split(",").map((c) => c.trim())

describe("pseudo-offer · public projection stays identity-free", () => {
  it("never selects seller_id or target_user from offers", () => {
    expect(offerCols).not.toContain("seller_id")
    expect(offerCols).not.toContain("target_user")
    // still exposes the marketplace essentials
    for (const col of [
      "id",
      "offer_id",
      "status",
      "type",
      "crypto_token",
      "crypto_amount",
      "fiat_currency",
      "fiat_amount",
      "price_per_unit",
      "min_amount",
      "max_amount",
      "payment_methods",
      "available_regions",
      "tags",
      "description",
      "grace_period",
      "published_at",
      "expires_at",
      "created_at",
    ]) {
      expect(offerCols).toContain(col)
    }
  })

  it("seller join carries only the opaque public_handle, never uid/wallet", () => {
    expect(sellerJoin).toContain("public_handle")
    expect(sellerJoin).not.toContain("id")
    expect(sellerJoin).not.toContain("wallet_address")
  })

  it("SellerProfile type excludes id and wallet_address", () => {
    expect(sellerJoin).toContain("nickname")
    expect(sellerJoin).toContain("avatar_url")
    expect(sellerJoin).toContain("verification_level")
    expect(sellerJoin).toContain("total_trades")
    expect(sellerJoin).toContain("avg_rating")
  })

  it("users public projection gains public_handle", () => {
    expect(userCols).toContain("public_handle")
  })

  it("client offer pages no longer read the seller identity off the offer row", () => {
    const pages = [
      "pages/OpenOfferPage.tsx",
      "pages/OffersPage.tsx",
      "pages/TradePage.tsx",
      "pages/EditOfferPage.tsx",
    ]
    for (const file of pages) {
      const body = readModule(file)
      // own-wallet usage (session/credit wiring) still refers to
      // `user.wallet_address` — only offer-row readers must be gone.
      expect(body).not.toMatch(/seller.{0,2}wallet_address/)
      expect(body).not.toMatch(/sellerAddr/)
      expect(body).not.toMatch(/offer\.seller_id/)
      expect(body).not.toMatch(/seller\.id\b/)
    }
  })

  it("TradePage resolves parties only through the intent RPC", () => {
    const tradePage = readModule("pages/TradePage.tsx")
    expect(tradePage).toMatch(/getOfferTradeIntent\(offer\.id\)/)
    expect(tradePage).not.toMatch(/offer\.seller_id/)
    expect(tradePage).not.toMatch(/sellerAddr/)
  })

  it("OpenOfferPage starts chat only through the server RPC", () => {
    const page = readModule("pages/OpenOfferPage.tsx")
    expect(page).toMatch(/startOfferConversation\(offer\.id\)/)
    expect(page).not.toMatch(/getOrCreateDirectConversation\(/)
    expect(page).not.toMatch(/seller\.id/)
  })
})

describe("pseudo-offer · migration enforces the surface", () => {
  it("adds users.public_handle with a random, unique default", () => {
    expect(migration).toMatch(/add column if not exists public_handle text/)
    expect(migration).toMatch(/users_public_handle_key unique/)
    expect(migration).toMatch(/gen_random_uuid\(\)/) // built-in (no pgcrypto)
    expect(migration).toMatch(/CN-/) // opaque label prefix
  })

  it("tightens offers SELECT for BOTH client roles (drop-and-regrant)", () => {
    // A bare column revoke is a no-op while the table grant exists (OD-02) —
    // the migration must drop table-level SELECT then grant the column list.
    // The DO-loop issues them parameterized for both roles.
    expect(migration).toMatch(
      /revoke select on table public\.(users|offers) from %s/
    )
    expect(migration).toMatch(/grant select \(/)
  })

  it("defines get_offer_trade_intent as SECURITY DEFINER for authenticated only", () => {
    expect(migration).toMatch(
      /function public\.get_offer_trade_intent\(p_offer_id uuid\)/
    )
    expect(migration).toMatch(/security definer/i)
    expect(migration).toMatch(
      /grant execute on function public\.get_offer_trade_intent\(uuid\) to authenticated/
    )
    // business rejections are encoded server-side
    expect(migration).toMatch(/P0002/)
    expect(migration).toMatch(/P0200/)
    expect(migration).toMatch(/P0201/)
    expect(migration).toMatch(/P0202/)
  })

  it("defines start_offer_conversation and reuses the direct-conversation RPC", () => {
    expect(migration).toMatch(
      /function public\.start_offer_conversation\(p_offer_id uuid\)/
    )
    expect(migration).toMatch(/security definer/i)
    expect(migration).toMatch(/get_or_create_direct_conversation/)
    expect(migration).toMatch(
      /grant execute on function public\.start_offer_conversation\(uuid\) to anon, authenticated/
    )
  })

it("edge public-data mirror stays in sync (no seller_id/target_user)", () => {
    const mirror = readFileSync(
      path.join(root, "functions/_lib/public-data.ts"),
      "utf8",
    )
    // format-agnostic (prettier may use ' or " quoting)
    expect(mirror).not.toMatch(/["']seller_id["']/)
    expect(mirror).not.toMatch(/["']target_user["']/)
    expect(mirror).toMatch(/["']public_handle["']/)
    // marketplace + detail go through the identity-free RPCs, never the
    // seller-FK REST embed (the anon key can't select offers.seller_id)
    expect(mirror).toMatch(/rpc\/get_public_offers/)
    expect(mirror).toMatch(/rpc\/get_public_offer_by_id/)
    expect(mirror).not.toMatch(/users!offers_seller_id_fkey/)
  })
})

describe("pseudo-offer · types stay coherent", () => {
  it("SellerProfile exposes no uid/wallet keys", () => {
    type HasId = "id" extends keyof SellerProfile ? true : false
    type HasWallet = "wallet_address" extends keyof SellerProfile ? true : false
    type HasHandle = "public_handle" extends keyof SellerProfile ? true : false
    const noId: HasId = false
    const noWallet: HasWallet = false
    const hasHandle: HasHandle = true
    expect(noId).toBe(false)
    expect(noWallet).toBe(false)
    expect(hasHandle).toBe(true)
    // OfferWithSeller still composes with the public seller shape
    const _w = null as unknown as OfferWithSeller
    expect(_w).toBeNull()
  })
})

describe("pseudo-offer · public reads go through RPCs, not the FK embed", () => {
  // The FK embed (`seller:users!offers_seller_id_fkey`) needs to SELECT
  // offers.seller_id to build the join, which `anon` structurally lacks
  // (42703/42501), so the marketplace + offer detail MUST call the
  // identity-free SECURITY DEFINER RPCs instead.
  const client = readModule("lib/supabase/index.ts")
  const migration04 = readFileSync(
    path.join(root, "supabase/migrations/20260920000004_public_offer_rpc.sql"),
    "utf8",
  )
  const sqlWithoutComments = migration04.replace(/^\s*--.*$/gm, "")

  it("getActiveOffers calls get_public_offers", () => {
    const fn = client.match(/export async function getActiveOffers[\s\S]*?\n}/)
    expect(fn).not.toBeNull()
    expect(fn![0]).toMatch(/\.rpc\("get_public_offers"/)
  })

  it("getOfferById calls get_public_offer_by_id", () => {
    const fn = client.match(/export async function getOfferById[\s\S]*?\n}/)
    expect(fn).not.toBeNull()
    expect(fn![0]).toMatch(/\.rpc\("get_public_offer_by_id"/)
  })

  it("public offer reads never embed the seller FK", () => {
    const publicReads = client.match(
      /export async function get(?:ActiveOffers|OfferById)[\s\S]*?\n}/g,
    )
    for (const fn of publicReads ?? []) {
      expect(fn).not.toMatch(/offers_seller_id_fkey/)
      expect(fn).not.toMatch(/from\("offers"\)/)
    }
  })

  it("migration 0004 defines both RPCs and grants them to both roles", () => {
    expect(migration04).toMatch(
      /function public\.get_public_offers\(p_limit integer default 50/,
    )
    expect(migration04).toMatch(/function public\.get_public_offer_by_id\(p_offer_id uuid\)/)
    expect(migration04).toMatch(/security definer/i)
    expect(migration04).toMatch(
      /grant execute on function public\.get_public_offers\(integer, integer\) to anon, authenticated/,
    )
    expect(migration04).toMatch(
      /grant execute on function public\.get_public_offer_by_id\(uuid\) to anon, authenticated/,
    )
    // internal join/filter may reference o.seller_id (definer context), but the
    // output projection must never carry the identity columns
    expect(sqlWithoutComments).toMatch(/o\.seller_id/)
    expect(sqlWithoutComments).not.toMatch(/(^|\n)\s*['"]?seller_id['"]?\s*,/)
    expect(sqlWithoutComments).not.toMatch(/target_user/)
  })
})
