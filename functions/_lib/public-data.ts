// Per-route *public* data projections, fetched server-side at the edge and
// injected into the SPA shell. Shapes mirror the client queries exactly
// (src/lib/supabase/index.ts getActiveOffers / getOfferById / ensureUser) so
// `seedEdgeData` can hydrate the react-query cache with no transforms.
//
// Only ever touches public surfaces. Private routes (trades, messages,
// disputes, operator, edit pages) are excluded upstream in `_middleware.ts`
// and never request data here.
//
// OD-02 (Restricted reader): the worker's credential is the anon key, so its
// selects MUST stay inside the column projection enforced DB-side by
// `20260915000002_od02_public_reader_projection.sql` (REVOKEs for the `anon`
// role). Any column outside the projection would 42501 the fetch. Keep the two
// lists in sync with that migration AND with the PUBLIC_*-columns in
// `src/lib/supabase/index.ts`.

import { edgeFetch } from './supabase-rest'
import type { EdgeEnv } from './supabase-rest'

// Mirrors the migration's accepted projection for `offers`.
const PUBLIC_OFFER_COLUMNS = [
  'id', 'offer_id', 'seller_id', 'status', 'type',
  'crypto_token', 'crypto_amount', 'fiat_currency', 'fiat_amount',
  'price_per_unit', 'min_amount', 'max_amount',
  'payment_methods', 'available_regions',
  'platform_fee_bps', 'network_fee', 'tags', 'description',
  'is_private', 'target_user', 'grace_period',
  'published_at', 'expires_at', 'created_at',
].join(',')

// Mirrors the migration's accepted projection for `users` (public profile).
// NOTE: the denormalized-stat columns (total_volume, last_30d_trades,
// last_30d_volume) are NOT included — they don't exist on the live DB yet
// (schema drift), and PostgREST would 42703 this fetch.
const PUBLIC_USER_COLUMNS = [
  'id', 'wallet_address', 'nickname', 'avatar_url', 'verification_level',
  'bio', 'avg_rating', 'reputation_score',
  'total_trades', 'completed_trades', 'cancelled_trades', 'dispute_count',
  'created_at',
].join(',')

// join subset the marketplace/detail pages actually render from the seller.
const SELLER_JOIN_COLUMNS = [
  'id', 'wallet_address', 'nickname', 'avatar_url',
  'verification_level', 'total_trades', 'avg_rating',
].join(',')

// `/rest/v1/offers?...&select=<cols>,seller:users!offers_seller_id_fkey(<cols>)`
const OFFER_SELECT = `${PUBLIC_OFFER_COLUMNS},seller:users!offers_seller_id_fkey(${SELLER_JOIN_COLUMNS})`

export interface PublicData {
  offers?: unknown[]
  offer?: unknown
  profile?: unknown
}

export async function collectPublicData(
  env: EdgeEnv,
  pathname: string,
): Promise<PublicData> {
  // Marketplace first page — mirrors getActiveOffers(20).
  if (pathname === '/app/offers') {
    const data = await edgeFetch(
      env,
      `/rest/v1/offers?status=eq.active&expires_at=gte.${new Date().toISOString()}&order=published_at.desc&limit=20&select=${encodeURIComponent(OFFER_SELECT)}`,
    )
    return { offers: Array.isArray(data) ? data : [] }
  }

  // Single offer detail — mirrors getOfferById(id).
  const offer = pathname.match(/^\/app\/offer\/([^/]+)$/)
  if (offer) {
    const rows = await edgeFetch(
      env,
      `/rest/v1/offers?id=eq.${encodeURIComponent(offer[1])}&select=${encodeURIComponent(OFFER_SELECT)}`,
    )
    return { offer: Array.isArray(rows) && rows.length > 0 ? rows[0] : null }
  }

  // Public profile — mirrors ensureUser read (users row by wallet), limited
  // to the public projection columns (OD-02).
  const profile = pathname.match(/^\/app\/profile\/([^/]+)$/)
  if (profile) {
    const addr = decodeURIComponent(profile[1]).toLowerCase()
    const rows = await edgeFetch(
      env,
      `/rest/v1/users?wallet_address=eq.${encodeURIComponent(addr)}&select=${encodeURIComponent(PUBLIC_USER_COLUMNS)}`,
    )
    return { profile: Array.isArray(rows) && rows.length > 0 ? rows[0] : null }
  }

  return {}
}