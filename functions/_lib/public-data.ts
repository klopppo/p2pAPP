// Per-route *public* data projections, fetched server-side at the edge and
// injected into the SPA shell. Shapes mirror the client queries exactly
// (src/lib/supabase/index.ts getActiveOffers / getOfferById / ensureUser) so
// `seedEdgeData` can hydrate the react-query cache with no transforms.
//
// Only ever touches public surfaces. Private routes (trades, messages,
// disputes, operator, edit pages) are excluded upstream in `_middleware.ts`
// and never request data here.
//
// OD-02 (Restricted reader) + ADR-015 (Pseudo-offerta, migrations
// `20260920000003_offer_pseudonym.sql` + `20260920000004_public_offer_rpc.sql`):
// the worker's credential is the anon key, so its selects MUST stay inside the
// column projection enforced DB-side (REVOKE table-level SELECT + GRANT column
// list for `anon` AND `authenticated`). Any column outside the projection would
// 42501 the fetch — including the `seller:users!…` FK embed, which needs
// `offers.seller_id`. The marketplace + offer-detail reads
// therefore go through the SECURITY DEFINER RPCs
// (`get_public_offers` / `get_public_offer_by_id`, migration 0004): the join is
// resolved server-side and the payloads carry only identity-free rows
// (`public_handle`, never `seller_id`/`target_user`). Keep this in sync with
// the migrations AND with the public-read paths in
// `src/lib/supabase/index.ts` (getActiveOffers / getOfferById).

import { edgeFetch } from "./supabase-rest"
import type { EdgeEnv } from "./supabase-rest"

// Mirrors the migration's accepted projection for `users` (public profile).
// NOTE: the denormalized-stat columns (total_volume, last_30d_trades,
// last_30d_volume) are NOT included — they don't exist on the live DB yet
// (schema drift), and PostgREST would 42703 this fetch.
const PUBLIC_USER_COLUMNS = [
  "id",
  "wallet_address",
  "public_handle",
  "nickname",
  "avatar_url",
  "verification_level",
  "bio",
  "avg_rating",
  "reputation_score",
  "total_trades",
  "completed_trades",
  "cancelled_trades",
  "dispute_count",
  "created_at",
].join(",")

// `/rest/v1/rpc/get_public_offers` (SECURITY DEFINER, migration 0004) — the
// direct `/rest/v1/offers?...seller:users!...(...)` FK-embed path is dead for
// the anon key (it needs offers.seller_id) and must not come back.
const RPC_GET_PUBLIC_OFFERS = "/rest/v1/rpc/get_public_offers"
const RPC_GET_PUBLIC_OFFER_BY_ID = "/rest/v1/rpc/get_public_offer_by_id"

export interface PublicData {
  offers?: unknown[]
  offer?: unknown
  profile?: unknown
}

export async function collectPublicData(
  env: EdgeEnv,
  pathname: string
): Promise<PublicData> {
  // Marketplace first page — mirrors getActiveOffers(20) via the RPC.
  if (pathname === "/app/offers") {
    const data = await edgeFetch(
      env,
      `${RPC_GET_PUBLIC_OFFERS}?p_limit=20&p_offset=0`
    )
    return { offers: Array.isArray(data) ? data : [] }
  }

  // Single offer detail — mirrors getOfferById(id) via the RPC. The RPC
  // returns a single jsonb object (or SQL NULL → null) for a missing id.
  const offer = pathname.match(/^\/app\/offer\/([^/]+)$/)
  if (offer) {
    const row = await edgeFetch(
      env,
      `${RPC_GET_PUBLIC_OFFER_BY_ID}?p_offer_id=${encodeURIComponent(offer[1])}`
    )
    return { offer: row ?? null }
  }

  // Public profile — mirrors ensureUser read (users row by wallet), limited
  // to the public projection columns (OD-02).
  const profile = pathname.match(/^\/app\/profile\/([^/]+)$/)
  if (profile) {
    // A malformed percent-encoding (`/app/profile/%`) makes decodeURIComponent
    // throw; this runs outside edgeFetch's try/catch, so an unguarded throw
    // would 500 every document response for that URL.
    let addr: string
    try {
      addr = decodeURIComponent(profile[1]).toLowerCase()
    } catch {
      return { profile: null }
    }
    const rows = await edgeFetch(
      env,
      `/rest/v1/users?wallet_address=eq.${encodeURIComponent(addr)}&select=${encodeURIComponent(PUBLIC_USER_COLUMNS)}`
    )
    return { profile: Array.isArray(rows) && rows.length > 0 ? rows[0] : null }
  }

  return {}
}
