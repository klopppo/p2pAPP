/**
 * Supabase Integration for CofferNode P2P Crypto Platform
 * @packageDocumentation
 */

import { createClient } from '@supabase/supabase-js'
import type {
  User,
  Offer,
  KYCApplication,
  Dispute,
  TradeRating,
  CreateTradeInput,
  ConversationView,
  ConversationWithParticipant,
  MessageKind,
  MessageWithSender,
  Notification,
  NotificationChannel,
  NotificationPreferences,
} from '@/types/database'

// Environment variables (these should be set in .env.local)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
// Prefer the new publishable key format (sb_publishable_*) when present;
// fall back to the legacy anon JWT (VITE_SUPABASE_ANON_KEY) for older
// projects. Both are safe to ship to the browser.
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
  )
}

/**
 * Main Supabase Client
 * Initialized with RLS policies for security
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  db: {
    schema: 'public',
  },
})

// =================================================================
// TYPES
// =================================================================

export const EscrowStatus = {
  AWAITING_DEPOSIT: 'awaiting_deposit',
  BUYER_DEPOSITED: 'buyer_deposited',
  SELLER_DEPOSITED: 'seller_deposited',
  /** KlerosEsc.State.FUNDED — buyer + seller deposits in and seller has
   *  locked tradeAmount. Distinct from SELLER_DEPOSITED which only captures
   *  one of those transitions. */
  FUNDED: 'funded',
  CONFIRMED: 'confirmed',
  DEPOSITED: 'deposited',
  PENDING_RELEASE: 'pending_release',
  DISPUTED: 'disputed',
  RELEASED: 'released',
  REFUNDED: 'refunded',
  /** KlerosEsc.State.CANCELLED — funding-phase mutual cancel via
   *  `cancelTrade()`. Distinct from REFUNDED (which is the buyer-favorable
   *  dispute payout). See contract-execution-status.md §B-3. */
  CANCELLED: 'cancelled',
} as const
export type EscrowStatus = typeof EscrowStatus[keyof typeof EscrowStatus]

/**
 * Subset of the KlerosEsc event names that the trade_events audit log uses.
 * Granular per-event trails are written by the future server-side indexer so
 * the UI can distinguish, for example, `RulingReceived` from `RulingExecuted`.
 */
export const TradeEventType = {
  OFFER_ACCEPTED: 'offer_accepted',
  ESCROW_FUNDED: 'escrow_funded',
  ESCROW_CONFIRMED: 'escrow_confirmed',
  ESCROW_RELEASED: 'escrow_released',
  ESCROW_REFUNDED: 'escrow_refunded',
  ESCROW_DISPUTED: 'escrow_disputed',
  ESCROW_RESOLVED: 'escrow_resolved',
  ESCROW_CANCELLED: 'escrow_cancelled',
  DISPUTE_RAISED: 'dispute_raised',
  EVIDENCE_SUBMITTED: 'evidence_submitted',
  APPEAL_FUNDED: 'appeal_funded',
  RULING_RECEIVED: 'ruling_received',
  RULING_EXECUTED: 'ruling_executed',
  DISPUTE_FINALIZED: 'dispute_finalized',
  DISPUTE_TIMED_OUT: 'dispute_timed_out',
  FUNDS_RETURNED: 'funds_returned',
  /** Generic fallback. */
  ESCROW_STATUS_UPDATED: 'escrow_status_updated',
  TRADE_STATUS_UPDATED: 'trade_status_updated',
} as const
export type TradeEventType = typeof TradeEventType[keyof typeof TradeEventType]

export const OfferStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const
export type OfferStatus = typeof OfferStatus[keyof typeof OfferStatus]

export const KYCStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
} as const
export type KYCStatus = typeof KYCStatus[keyof typeof KYCStatus]

export const VerificationLevel = {
  UNVERIFIED: 'unverified',
  VERIFIED: 'verified',
  TRUSTED: 'trusted',
  SUSPICIOUS: 'suspicious',
} as const
export type VerificationLevel = typeof VerificationLevel[keyof typeof VerificationLevel]

export const UserRole = {
  USER: 'user',
  ADMIN: 'admin',
  MEDIATOR: 'mediator',
  SUPPORT: 'support',
} as const
export type UserRole = typeof UserRole[keyof typeof UserRole]

export const TradeStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
  REFUNDED: 'refunded',
} as const
export type TradeStatus = typeof TradeStatus[keyof typeof TradeStatus]

export const DisputeStatus = {
  OPEN: 'open',
  IN_REVIEW: 'in_review',
  RESOLVED: 'resolved',
  ESCALATED: 'escalated',
  CLOSED: 'closed',
} as const
export type DisputeStatus = typeof DisputeStatus[keyof typeof DisputeStatus]

// =================================================================
// USER QUERIES
// =================================================================

/**
 * Get user by wallet address
 */
export async function getUserByWallet(walletAddress: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_address', walletAddress.toLowerCase())
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found - this is expected for new users
      return null
    }
    console.error('Error fetching user:', error)
    throw error
  }

  return data as User
}

import { getCachedUser, setCachedUser, invalidateUserCache, clearAllUserCache } from '@/lib/userCache'

/**
 * Ensure a user row exists for the given wallet address.
 *
 * This is the "sync" path — called on every wallet connect. It only inserts
 * a new row if one doesn't exist (post-SIWE, the `siwe-auth` edge function
 * creates new rows at sign-in time, so this read usually just hits), and
 * updates `last_active_at`. It does NOT touch profile fields (nickname, bio,
 * etc.) so existing profiles are never overwritten.
 *
 * RLS note: after the SIWE RLS rewrite, the `users` INSERT is only allowed for
 * a row whose `wallet_address` equals the signed-in session's wallet claim.
 * If no session exists yet for this wallet we return null instead of throwing
 * (sign-in happens via `ensureWalletSession`, triggered on connect).
 *
 * Reads from cache first; writes cache after DB read.
 */
export async function ensureUser(walletAddress: string): Promise<User | null> {
  const addr = walletAddress.toLowerCase()

  // 1. Check cache first
  const cached = getCachedUser(addr)
  if (cached) return cached

  // 2. Try to read existing row
  const { data: existing, error: readErr } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_address', addr)
    .maybeSingle()

  if (readErr) {
    console.error('[ensureUser] read error:', readErr)
    throw readErr
  }

  if (existing) {
    // 3a. Row exists — just touch last_active_at (fire-and-forget, don't block).
    //     Only meaningful once signed in (RLS requires a session to UPDATE).
    supabase
      .from('users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('wallet_address', addr)
      .then(({ error }) => {
        if (error) console.warn('[ensureUser] last_active_at update failed:', error)
      })

    const user = existing as User
    setCachedUser(user)
    return user
  }

  // 3b. New user — insert with defaults, but only when the signed-in wallet
  //     matches (RLS will reject anything else). Missing row + no matching
  //     session = user hasn't completed SIWE yet; return null quietly.
  const sessionWallet = await getSessionWallet()
  if (sessionWallet !== addr) return null

  const { data: inserted, error: insertErr } = await supabase
    .from('users')
    .insert({ wallet_address: addr, last_active_at: new Date().toISOString() })
    .select()
    .single()

  if (insertErr) {
    console.error('[ensureUser] insert error:', insertErr)
    throw insertErr
  }

  const user = inserted as User
  setCachedUser(user)
  return user
}

/**
 * Update profile fields on the user row. Called ONLY from EditProfilePage.
 * Writes through to DB, then invalidates + refreshes the cache.
 */
export async function updateUserProfile(
  walletAddress: string,
  profile: {
    nickname?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    website?: string | null
    twitterHandle?: string | null
    telegramHandle?: string | null
    githubHandle?: string | null
  }
): Promise<User> {
  const addr = walletAddress.toLowerCase()

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        wallet_address: addr,
        nickname: profile.nickname ?? null,
        avatar_url: profile.avatarUrl ?? null,
        bio: profile.bio ?? null,
        location: profile.location ?? null,
        website: profile.website ?? null,
        twitter_handle: profile.twitterHandle ?? null,
        telegram_handle: profile.telegramHandle ?? null,
        github_handle: profile.githubHandle ?? null,
      },
      { onConflict: 'wallet_address' }
    )
    .select()
    .single()

  if (error) {
    console.error('[updateUserProfile] error:', error)
    throw error
  }

  const user = data as User
  invalidateUserCache(addr)
  setCachedUser(user)
  return user
}

const AVATAR_BUCKET = 'avatars'

/**
 * Upload a user's avatar image to Supabase Storage and return a public URL.
 *
 * Replaces the old IPFS/Helia path: a browser Helia node never pins the CID to
 * the public network, so `https://ipfs.io/ipfs/<cid>` returned 404 and avatars
 * never rendered on /profile. Storage object URLs are always retrievable.
 */
export async function uploadAvatar(
  file: File,
  walletAddress: string,
): Promise<{ url: string; path: string }> {
  const addr = walletAddress.toLowerCase()
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${addr}-${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, cacheControl: '3600' })

  if (uploadErr) {
    console.error('[uploadAvatar] upload error:', uploadErr)
    throw uploadErr
  }

  const { data } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(path)

  return { url: data.publicUrl, path }
}

/**
 * @deprecated Use `ensureUser` (sync) or `updateUserProfile` (edit).
 */
export async function upsertUser(
  walletAddress: string,
  profile?: {
    nickname?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    website?: string | null
    twitterHandle?: string | null
    telegramHandle?: string | null
    githubHandle?: string | null
  }
) {
  if (profile && Object.values(profile).some((v) => v !== undefined && v !== null)) {
    return updateUserProfile(walletAddress, profile)
  }
  return ensureUser(walletAddress)
}

/**
 * Update user reputation score
 */
export async function updateUserReputation(userId: string, delta: number) {
  const { error } = await supabase.rpc('increment_reputation_score', {
    user_id: userId,
    delta: delta,
  })

  if (error) {
    console.error('Error updating reputation:', error)
    throw error
  }
}

// =================================================================
// OFFER QUERIES
// =================================================================

/**
 * Get active offers
 */
export async function getActiveOffers(limit = 50, offset = 0) {
  const { data, error } = await supabase
    .from('offers')
    .select(`
      *,
      seller:users!offers_seller_id_fkey (wallet_address, nickname, avatar_url, verification_level, total_trades, avg_rating)
    `)
    .eq('status', OfferStatus.ACTIVE)
    .gte('expires_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('Error fetching offers:', error)
    throw error
  }

  return data
}

/**
 * Get offers by seller
 */
export async function getOffersBySeller(sellerId: string, status?: OfferStatus) {
  const query = supabase
    .from('offers')
    .select(`
      *,
      seller:users!offers_seller_id_fkey (nickname, avatar_url, verification_level)
    `)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })

  if (status) {
    query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching seller offers:', error)
    throw error
  }

  return data
}

/**
 * Generate a client-side unique `offer_id`.
 *
 * offers.offer_id is VARCHAR(40) NOT NULL UNIQUE with no DB default, and the
 * planned generate_offer_id() SQL function isn't deployed, so we mint one here.
 * Format: OFF-<base36 timestamp><random> (~18 chars, well within 40).
 */
export function generateOfferId(): string {
  return `OFF-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
}

/**
 * Get a single offer by its primary key (the `:id` route param), with the
 * seller profile joined so TradePage / OpenOfferPage can render trader info.
 */
export async function getOfferById(id: string) {
  const { data, error } = await supabase
    .from('offers')
    .select(`
      *,
      seller:users!offers_seller_id_fkey (wallet_address, nickname, avatar_url, verification_level, total_trades, avg_rating)
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching offer:', error)
    throw error
  }

  return data
}

/**
 * Create new offer
 */
export async function createOffer(offerData: Partial<Offer>) {
  const { data, error } = await supabase
    .from('offers')
    .insert({
      ...offerData,
      offer_id: offerData.offer_id ?? generateOfferId(),
      status: OfferStatus.ACTIVE,
      published_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating offer:', error)
    throw error
  }

  return data
}

// =================================================================
// TRADE QUERIES
// =================================================================

/**
 * Generate a client-side unique `trade_id`.
 *
 * trades.trade_id is VARCHAR(40) NOT NULL UNIQUE with no DB default (same
 * situation as offers.offer_id), so we mint one here.
 * Format: TRD-<base36 timestamp><random> (~18 chars, well within 40).
 */
export function generateTradeId(): string {
  return `TRD-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
}

/**
 * Generate a client-side unique `dispute_id` for the `disputes.dispute_id`
 * varchar column. Same shape as `generateOfferId`/`generateTradeId`:
 * 3-letter prefix + base36 timestamp + 6 random chars (~18 chars, fits the
 * 40-char varchar).
 */
export function generateDisputeId(): string {
  return `DSP-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
}

/**
 * Get active trades by buyer
 */
export async function getActiveTradesByBuyer(buyerId: string) {
  const { data, error } = await supabase
    .from('trades')
    .select(`
      *,
      offer:offers(*),
      buyer:users!trades_buyer_id_fkey (nickname, avatar_url, verification_level),
      seller:users!trades_seller_id_fkey (nickname, avatar_url, verification_level)
    `)
    .eq('buyer_id', buyerId)
    .eq('status', TradeStatus.ACTIVE)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching trades:', error)
    throw error
  }

  return data
}

/**
 * Get active trades by seller
 */
export async function getActiveTradesBySeller(sellerId: string) {
  const { data, error } = await supabase
    .from('trades')
    .select(`
      *,
      offer:offers(*),
      buyer:users!trades_buyer_id_fkey (nickname, avatar_url, verification_level),
      seller:users!trades_seller_id_fkey (nickname, avatar_url, verification_level)
    `)
    .eq('seller_id', sellerId)
    .eq('status', TradeStatus.ACTIVE)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching trades:', error)
    throw error
  }

  return data
}

/**
 * Get trade by trade ID
 */
export async function getTradeByTradeId(tradeId: string) {
  const { data, error } = await supabase
    .from('trades')
    .select(`
      *,
      offer:offers(*),
      buyer:users!trades_buyer_id_fkey (nickname, avatar_url, verification_level),
      seller:users!trades_seller_id_fkey (nickname, avatar_url, verification_level),
      ratings:trade_ratings(*)
    `)
    .eq('trade_id', tradeId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching trade:', error)
    throw error
  }

  return data
}

/**
 * Get trade by its primary UUID `id` (the `:id` route param used by the
 * trade detail viewer). Joins the offer + both parties so the page can render
 * without N+1 follow-ups.
 */
export async function getTradeById(id: string) {
  const { data, error } = await supabase
    .from('trades')
    .select(`
      *,
      offer:offers(*),
      buyer:users!trades_buyer_id_fkey (wallet_address, nickname, avatar_url, verification_level),
      seller:users!trades_seller_id_fkey (wallet_address, nickname, avatar_url, verification_level)
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching trade by id:', error)
    throw error
  }

  return data
}

/**
 * Update a trade's `escrow_status` + last-action tx hash. Mirror of the
 * on-chain state for fast listing without an RPC round-trip. Caller passes the
 * status string from the local enum (`EscrowStatus`); this function does NOT
 * validate against the enum (it's a passthrough).
 */
export async function upsertTradeEscrowStatus(
  tradeId: string,
  escrowStatus: string,
  txHash?: string,
) {
  const updates: Record<string, unknown> = {
    escrow_status: escrowStatus,
    updated_at: new Date().toISOString(),
  }
  if (txHash) updates.escrow_tx_hash = txHash
  const { data, error } = await supabase
    .from('trades')
    .update(updates)
    .eq('id', tradeId)
    .select()
    .single()

  if (error) {
    console.error('Error updating trade escrow status:', error)
    throw error
  }

  await logTradeEvent(
    data.id,
    'escrow_status_updated',
    'system',
    `Escrow status → ${escrowStatus}`,
    { escrow_status: escrowStatus, tx_hash: txHash ?? null },
  ).catch(() => {
    /* non-fatal — the status mirror already landed */
  })

  return data
}

/**
 * Update a trade's high-level lifecycle `status` (pending/active/completed/
 * cancelled/disputed/refunded) plus the matching timestamp column. Mirrors the
 * terminal on-chain outcome into Supabase so listing pages can filter without
 * an RPC round-trip. Logs a `trade_status_updated` event.
 *
 * Pass `escrowEventType` to override the generic trade_status_updated entry
 * with a granular Kleros-specific value (e.g. ESCROW_RELEASED when calling
 * this from `handleRelease`).
 */
export async function updateTradeStatus(
  tradeId: string,
  status: string,
  options?: {
    escrowStatus?: string
    txHash?: string
    escrowEventType?: TradeEventType
  },
) {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    status,
    updated_at: now,
  }
  if (options?.escrowStatus) updates.escrow_status = options.escrowStatus
  if (options?.txHash) updates.escrow_tx_hash = options.txHash
  if (status === 'completed') updates.completed_at = now
  if (status === 'cancelled') updates.cancelled_at = now
  if (status === 'disputed') {
    updates.disputed_at = now
    updates.has_dispute = true
  }

  const { data, error } = await supabase
    .from('trades')
    .update(updates)
    .eq('id', tradeId)
    .select()
    .single()

  if (error) {
    console.error('Error updating trade status:', error)
    throw error
  }

  await logTradeEvent(
    data.id,
    options?.escrowEventType ?? TradeEventType.TRADE_STATUS_UPDATED,
    'system',
    `Trade status → ${status}`,
    {
      status,
      escrow_status: options?.escrowStatus ?? null,
      tx_hash: options?.txHash ?? null,
    },
  ).catch(() => {
    /* non-fatal — the status mirror already landed */
  })

  return data
}

/**
 * Update a trade's `escrow_status` only (no high-level status flip).
 * Used when an on-chain transition doesn't move the trade to a terminal
 * state — e.g. SellerFundsLocked → FUNDED, BuyerSecurityDeposited, etc.
 * Logs a granular Kleros event so the audit trail shows the exact transition.
 */
export async function setTradeEscrowStatus(
  tradeId: string,
  escrowStatus: EscrowStatus,
  options?: { txHash?: string; escrowEventType?: TradeEventType },
) {
  const updates: Record<string, unknown> = {
    escrow_status: escrowStatus,
    updated_at: new Date().toISOString(),
  }
  if (options?.txHash) updates.escrow_tx_hash = options.txHash

  const { data, error } = await supabase
    .from('trades')
    .update(updates)
    .eq('id', tradeId)
    .select()
    .single()

  if (error) {
    console.error('Error setting trade escrow status:', error)
    throw error
  }

  await logTradeEvent(
    data.id,
    options?.escrowEventType ?? TradeEventType.ESCROW_STATUS_UPDATED,
    'system',
    `Escrow status → ${escrowStatus}`,
    { escrow_status: escrowStatus, tx_hash: options?.txHash ?? null },
  ).catch(() => {
    /* non-fatal — the status mirror already landed */
  })

  return data
}

/**
 * Create a new trade from an offer.
 *
 * Persists both the offer-side metadata and (if `escrowAddress` is supplied)
 * the Kleros/Escrow configuration snapshot so the server-side indexer doesn't
 * have to re-read the chain per row. The buyer/seller roles are resolved by
 * the caller based on offer.type (the taker is the opposite party).
 *
 * Logs an `offer_accepted` event using the inserted row's UUID `id`
 * (trade_events.trade_id is the UUID primary key, NOT the varchar trade_id).
 */
export async function createTrade(input: CreateTradeInput) {
  const insertRow: Record<string, unknown> = {
    trade_id: generateTradeId(),
    offer_id: input.offer_id,
    status: TradeStatus.ACTIVE,
    buyer_id: input.buyer_id,
    seller_id: input.seller_id,
    crypto_token: input.crypto_token,
    crypto_amount: input.crypto_amount,
    crypto_price_per_unit: input.crypto_price_per_unit,
    fiat_currency: input.fiat_currency,
    fiat_amount: input.fiat_amount,
    payment_method: input.payment_method,
    payment_details: input.payment_details ?? {},
    platform_fee_bps: input.platform_fee_bps,
    treasury_address: input.treasury_address ?? null,
    creator: input.creator ?? null,
    kleros_court_addr: input.kleros_court_addr ?? null,
    kleros_extra_data_part1: input.kleros_extra_data_part1 ?? null,
    kleros_extra_data_part2: input.kleros_extra_data_part2 ?? null,
  }
  if (input.escrow_contract_addr) {
    insertRow.escrow_contract_addr = input.escrow_contract_addr
    insertRow.escrow_status = EscrowStatus.AWAITING_DEPOSIT
  } else {
    insertRow.escrow_contract_addr = null
    insertRow.escrow_status = EscrowStatus.AWAITING_DEPOSIT
  }
  const { data, error } = await supabase
    .from('trades')
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    console.error('Error creating trade:', error)
    throw error
  }

  await logTradeEvent(
    data.id,
    'offer_accepted',
    input.taker_role,
    `Trade opened by ${input.taker_role}`,
    {
      escrow_address: input.escrow_contract_addr ?? null,
      creator: input.creator ?? null,
      kleros_court: input.kleros_court_addr ?? null,
    },
  )

  return data
}

/**
 * All trades where the user is buyer OR seller, newest first, with the
 * counterparty + offer joined so the trades list page renders without N+1.
 */
export async function getTradesByUser(userId: string) {
  const { data, error } = await supabase
    .from('trades')
    .select(`
      *,
      offer:offers(*),
      buyer:users!trades_buyer_id_fkey (wallet_address, nickname, avatar_url, verification_level),
      seller:users!trades_seller_id_fkey (wallet_address, nickname, avatar_url, verification_level)
    `)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user trades:', error)
    throw error
  }

  return data
}

/**
 * Find a trade by its deployed escrow contract address. Used when wiring a
 * dispute to its trade: the dispute row needs the uuid `trade_id` plus both
 * parties' user ids, but the app only has the escrow address to go on.
 */
export async function getTradeByEscrowAddress(escrowAddress: string) {
  const { data, error } = await supabase
    .from('trades')
    .select('id, buyer_id, seller_id')
    .eq('escrow_contract_addr', escrowAddress)
    .maybeSingle()

  if (error) {
    console.error('Error fetching trade by escrow:', error)
    throw error
  }

  return data as { id: string; buyer_id: string; seller_id: string } | null
}

/**
 * Log trade event
 */
export async function logTradeEvent(
  tradeId: string,
  eventType: string,
  actor: string,
  description?: string,
  metadata?: Record<string, unknown>
) {
  const { error } = await supabase.from('trade_events').insert({
    trade_id: tradeId,
    type: eventType,
    actor: actor,
    description: description || null,
    metadata: metadata || {},
  })

  if (error) {
    console.error('Error logging trade event:', error)
    throw error
  }
}

// =================================================================
// KYC QUERIES
// =================================================================

/**
 * Create KYC application
 */
export async function createKYCApplication(userId: string, kycData: Partial<KYCApplication>) {
  const { data, error } = await supabase
    .from('kyc_applications')
    .insert({
      user_id: userId,
      ...kycData,
      status: KYCStatus.PENDING,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating KYC application:', error)
    throw error
  }

  return data
}

/**
 * Get KYC application by user
 */
export async function getKYCApplicationByUser(userId: string) {
  const { data, error } = await supabase
    .from('kyc_applications')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching KYC application:', error)
    throw error
  }

  return data
}

// =================================================================
// DISPUTE QUERIES
// =================================================================

/**
 * Mirror the on-chain state of a dispute's escrow back into the Supabase row.
 * Called by `DisputeDetailPage` after each on-chain action
 * (executeRuling / finalize / timeoutDispute / appeal) AND by the
 * `useEscrowEventWatcher` callback when the underlying events fire so the
 * cache stays current when nobody has the page open.
 *
 * Pass only the fields that changed; undefined keys are left untouched.
 * `resolvedAt` should be set when the dispute reaches a terminal state.
 */
export async function updateDisputeOnChain(
  id: string,
  update: {
    escrowState?: number | null
    klerosDisputeStatus?: number | null
    onChainRuling?: number | null
    status?: DisputeStatus
    resolvedAt?: string | null
    evidenceGroupId?: number | null
    appealCount?: number | null
    raiser?: 'buyer' | 'seller' | null
    feePaidWei?: string | null
    winner?: 'buyer' | 'seller' | null
    disputeTimestamp?: string | null
    rulingReceivedTime?: string | null
  },
) {
  const dbUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (update.escrowState !== undefined) dbUpdate.escrow_state = update.escrowState
  if (update.klerosDisputeStatus !== undefined) {
    dbUpdate.kleros_dispute_status = update.klerosDisputeStatus
  }
  if (update.onChainRuling !== undefined) {
    dbUpdate.on_chain_ruling = update.onChainRuling
  }
  if (update.status) dbUpdate.status = update.status
  if (update.resolvedAt) dbUpdate.resolved_at = update.resolvedAt
  if (update.evidenceGroupId !== undefined) {
    dbUpdate.evidence_group_id = update.evidenceGroupId
  }
  if (update.appealCount !== undefined) {
    dbUpdate.appeal_count = update.appealCount
  }
  if (update.raiser !== undefined) dbUpdate.raiser = update.raiser
  if (update.feePaidWei !== undefined) dbUpdate.fee_paid_wei = update.feePaidWei
  if (update.winner !== undefined) dbUpdate.winner = update.winner
  if (update.disputeTimestamp !== undefined) {
    dbUpdate.dispute_timestamp = update.disputeTimestamp
  }
  if (update.rulingReceivedTime !== undefined) {
    dbUpdate.ruling_received_time = update.rulingReceivedTime
  }

  const { data, error } = await supabase
    .from('disputes')
    .update(dbUpdate)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating dispute on-chain state:', error)
    throw error
  }
  return data
}

/**
 * Create dispute. `status` defaults to `DisputeStatus.OPEN` (the Supabase row
 * lifecycle starts there); the page should bump to `'in_review'` right after
 * `raiseDispute` lands via `updateDisputeOnChain` (B-9).
 */
export async function createDispute(disputeData: Partial<Dispute>) {
  const { data, error } = await supabase
    .from('disputes')
    .insert({
      ...disputeData,
      status: disputeData.status ?? DisputeStatus.OPEN,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating dispute:', error)
    throw error
  }

  return data
}

/**
 * Mirror the terminal outcome of a dispute into the linked `trades` row.
 * Called from `DisputeDetailPage` on `executeRuling` / `finalize` /
 * `timeoutDispute` so the trades list reflects the settlement even when
 * nobody has the dispute page open. Best-effort — caller should `.catch(noop)`
 * if it doesn't want to block the tx flow.
 */
export async function mirrorDisputeToTrade(
  tradeId: string,
  outcome: {
    /** Resulting trade status. */
    tradeStatus: 'completed' | 'refunded' | 'disputed'
    /** Matching escrow_status (released / refunded / disputed). */
    escrowStatus: EscrowStatus
    /** Tx hash of the settlement call. */
    txHash: string
    /** Per-event type for the trade_events row. */
    escrowEventType: TradeEventType
  },
) {
  return updateTradeStatus(tradeId, outcome.tradeStatus, {
    escrowStatus: outcome.escrowStatus,
    txHash: outcome.txHash,
    escrowEventType: outcome.escrowEventType,
  })
}

/**
 * Insert one row per uploaded evidence file. Called from `DisputePage`
 * (one tx per file via `submitEvidence(bytes32)`) and from
 * `DisputeDetailPage` ("Submit additional evidence" loop).
 *
 * Each row carries:
 *   - the IPFS CID + gateway URL (off-chain display)
 *   - the keccak256 bytes32 actually posted on-chain
 *   - the tx hash of the corresponding `submitEvidence` call (best-effort
 *     populated by the page; NULL when only the off-chain row landed)
 *   - the on-chain `evidenceGroupID` at submission time
 *   - the filer's role (buyer/seller). Caller MUST pass this explicitly;
 *     we don't default anymore because a seller-raised dispute was being
 *     tagged `'buyer'` (B-4).
 */
export interface DisputeEvidenceFile {
  cid: string
  url: string
  /** Display name. May be undefined when the IPFS upload didn't surface a
   *  filename, in which case the caller should fall back to the local
   *  File object's `name`. */
  name?: string
  size?: number
  kind?: string
  /** keccak256(cid) as 0x-prefixed bytes32 — the value sent to
   *  `KlerosEsc.submitEvidence(bytes32)`. */
  keccakBytes32?: `0x${string}` | null
  /** Tx hash of the on-chain submitEvidence call, if it succeeded. */
  txHash?: `0x${string}` | null
  /** KlerosEsc.evidenceGroupID at submission time (0 = first round). */
  evidenceGroupId?: number | null
}

export async function insertDisputeEvidence(
  disputeId: string,
  files: DisputeEvidenceFile[],
  submittedBy: 'buyer' | 'seller' | 'neutral',
  evidenceGroupId: number | null = null,
) {
  if (files.length === 0) return []
  if (!submittedBy) {
    throw new Error(
      '[insertDisputeEvidence] submittedBy is required — pass the filer role explicitly (B-4).',
    )
  }
  const now = new Date().toISOString()
  const rows = files.map((f) => ({
    dispute_id: disputeId,
    submitted_by: submittedBy,
    evidence_kind: f.kind ?? 'image',
    ipfs_cid: f.cid,
    ipfs_url: f.url,
    keccak_bytes32: f.keccakBytes32 ?? null,
    tx_hash: f.txHash ?? null,
    evidence_group_id: f.evidenceGroupId ?? evidenceGroupId ?? null,
    submitted_at: now,
  }))
  const { data, error } = await supabase
    .from('dispute_evidence')
    .insert(rows)
    .select()
  if (error) {
    console.error('Error inserting dispute evidence:', error)
    throw error
  }
  return data ?? []
}

/**
 * Get disputes by trade
 */
export async function getDisputesByTrade(tradeId: string) {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('trade_id', tradeId)

  if (error) {
    console.error('Error fetching disputes:', error)
    throw error
  }

  return data
}

/**
 * Get disputes where the user is either buyer or seller (via the
 * joined trade.buyer_id / trade.seller_id columns on `disputes`). Uses
 * PostgREST `.or()` so a single round-trip returns both sides.
 */
export async function getDisputesByUser(userId: string) {
  const { data, error } = await supabase
    .from('disputes')
    .select(`
      *,
      trade:trades(trade_id, crypto_token, crypto_amount),
      buyer:users!disputes_buyer_id_fkey (nickname, avatar_url),
      seller:users!disputes_seller_id_fkey (nickname, avatar_url)
    `)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user disputes:', error)
    throw error
  }

  return data
}

/**
 * Get a single dispute by its primary UUID `id` (the `:id` route param on
 * the dispute detail viewer). Joins the trade, both parties, and all evidence
 * rows so the detail page can render without N+1 follow-ups.
 */
export async function getDisputeById(id: string) {
  const { data, error } = await supabase
    .from('disputes')
    .select(`
      *,
      trade:trades(
        trade_id, crypto_token, crypto_amount, fiat_currency, fiat_amount,
        status, payment_method, escrow_status, escrow_contract_addr,
        buyer:users!trades_buyer_id_fkey (wallet_address, nickname, avatar_url),
        seller:users!trades_seller_id_fkey (wallet_address, nickname, avatar_url)
      ),
      buyer:user!disputes_buyer_id_fkey (wallet_address, nickname, avatar_url, verification_level),
      seller:users!disputes_seller_id_fkey (wallet_address, nickname, avatar_url, verification_level),
      evidence:dispute_evidence(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching dispute:', error)
    throw error
  }

  return data
}

// =================================================================
// RATING QUERIES
// =================================================================

/**
 * Submit trade rating
 */
export async function submitTradeRating(ratingData: Partial<TradeRating>) {
  const { data, error } = await supabase
    .from('trade_ratings')
    .insert({
      ...ratingData,
      submitted_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error submitting rating:', error)
    throw error
  }

  return data
}

/**
 * Get ratings for trade
 */
export async function getRatingsForTrade(tradeId: string) {
  const { data, error } = await supabase
    .from('trade_ratings')
    .select(`
      *,
      rater:user!trade_ratings_rater_id_fkey (nickname, avatar_url),
      rated:user!trade_ratings_rated_id_fkey (nickname, avatar_url)
    `)
    .eq('trade_id', tradeId)
    .order('submitted_at', { ascending: false })

  if (error) {
    console.error('Error fetching ratings:', error)
    throw error
  }

  return data
}

/**
 * Get all ratings where a specific user was the rated party (for profile page).
 */
export async function getRatingsByUser(userId: string) {
  const { data, error } = await supabase
    .from('trade_ratings')
    .select(`
      *,
      rater:user!trade_ratings_rater_id_fkey (nickname, avatar_url),
      trade:trades (trade_id, crypto_token, fiat_amount, fiat_currency)
    `)
    .eq('rated_id', userId)
    .order('submitted_at', { ascending: false })

  if (error) {
    console.error('Error fetching user ratings:', error)
    throw error
  }

  return data
}

/**
 * Read the cached `reputation_scores` row for a user. Returns null if the row
 * doesn't exist (older accounts that haven't earned / lost reputation yet).
 */
export async function getReputationScores(userId: string) {
  const { data, error } = await supabase
    .from('reputation_scores')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching reputation scores:', error)
    throw error
  }
  return data
}

/**
 * Check if a user has already rated a specific trade.
 */
export async function hasUserRatedTrade(tradeId: string, userId: string) {
  const { data, error } = await supabase
    .from('trade_ratings')
    .select('id')
    .eq('trade_id', tradeId)
    .eq('rater_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Error checking rating:', error)
    throw error
  }

  return !!data
}

// =================================================================
// CHAT QUERIES (see migration 20260724000004)
// =================================================================

const USER_SELECT =
  'id, wallet_address, nickname, avatar_url, verification_level, last_active_at'

/**
 * Find a conversation by the linked trade's primary UUID. Trades get a
 * conversation auto-created by the `create_conversation_for_trade` trigger,
 * so this is the canonical entry point after `createTrade()` returns.
 */
export async function getConversationByTradeId(tradeId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      trade:trades(
        id, trade_id, status, escrow_status,
        crypto_token, crypto_amount, fiat_currency, fiat_amount
      ),
      participants:conversation_participants(
        conversation_id, user_id, role, last_read_message_id, muted, joined_at,
        user:users!conversation_participants_user_id_fkey (${USER_SELECT})
      )
    `)
    .eq('trade_id', tradeId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching conversation by trade:', error)
    throw error
  }

  return data as ConversationView & {
    participants: Array<ConversationWithParticipant>
  }
}

/**
 * List the current user's conversations (those they're a participant in),
 * sorted newest-first by last_message_at.
 *
 * Each row carries the other party's profile and the linked trade summary
 * so the chat sidebar can render without extra round-trips.
 */
export async function listConversations(userId: string) {
  // First get the user's conversation ids (cheap). The result has nested
  // arrays from PostgREST joins; we flatten + shape them below.
  const { data: rows, error } = await supabase
    .from('conversation_participants')
    .select(
      `conversation_id, role, last_read_message_id, muted,
       conversation:conversations(
         id, trade_id, status, last_message_at, last_message_preview,
         created_at, updated_at,
         trade:trades(
           id, trade_id, status, escrow_status,
           crypto_token, crypto_amount, fiat_currency, fiat_amount
         ),
         participants:conversation_participants(
           conversation_id, user_id, role, last_read_message_id, muted, joined_at,
           user:users!conversation_participants_user_id_fkey (${USER_SELECT})
         )
       )`
    )
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })

  if (error) {
    console.error('Error listing conversations:', error)
    throw error
  }

  // Flatten the nested shape into ConversationView[] and compute unread counts.
  const out: ConversationView[] = []
  for (const row of (rows ?? []) as unknown as Array<{
    conversation: ConversationView | null
  }>) {
    const conv = row.conversation
    if (!conv) continue

    const participants = (conv.participants ?? []) as ConversationWithParticipant[]
    const me = participants.find((p) => p.user_id === userId)
    const lastReadId = me?.last_read_message_id ?? null

    // Count messages strictly newer than the user's last_read_message_id
    // (and not authored by the user). One cheap query per conversation.
    let q = supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .neq('sender_id', userId)
    if (lastReadId) {
      const cursor = await getMessageSortKey(lastReadId)
      q = q.or(
        `and(created_at.gt.${cursor.created_at},id.gt.${cursor.id}),created_at.gt.${cursor.created_at}`
      )
    }
    const { count } = await q
    const unread = count ?? 0

    out.push({
      ...conv,
      participants,
      trade: conv.trade ?? null,
      unread_count: unread,
      last_read_message_id: lastReadId,
    })
  }

  // Sort newest-activity first.
  out.sort((a, b) => {
    const at = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
    const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
    return bt - at
  })

  return out
}

/**
 * Create a direct (non-trade) conversation between the current user and
 * `otherUserId`, returning the new conversation id. Idempotent: if a
 * conversation already exists between the two users (any trade-anchored
 * thread counts), its id is returned without creating a new row.
 *
 * v1's `create_conversation_for_trade` trigger only fires on trade
 * insert, so two users who've never traded have no conversation row
 * between them. This helper lets the ProfilePage 'Message' button spin
 * one up on demand so the chat route resolves to a real conversation.
 */
export async function getOrCreateDirectConversation(
  currentUserId: string,
  otherUserId: string,
): Promise<string | null> {
  if (currentUserId === otherUserId) return null

  // Look for an existing conversation (any trade-anchored one counts).
  const { data: existing, error: listErr } = await supabase
    .from('conversations')
    .select('id, participants:conversation_participants(user_id)')
    .is('trade_id', null)
  if (listErr) {
    console.error('[getOrCreateDirectConversation] list failed:', listErr)
    return null
  }
  for (const row of existing ?? []) {
    const ids = (row.participants ?? []).map(
      (p: { user_id: string }) => p.user_id,
    )
    if (ids.includes(currentUserId) && ids.includes(otherUserId)) {
      return row.id as string
    }
  }

  // Create a fresh conversation + two participants. The trade_id column
  // is nullable, so a non-trade-anchored row is legal.
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({ trade_id: null, status: 'open' })
    .select('id')
    .single()
  if (convErr || !conv) {
    console.error('[getOrCreateDirectConversation] insert failed:', convErr)
    return null
  }
  const convId = conv.id as string
  const { error: partErr } = await supabase
    .from('conversation_participants')
    .insert([
      { conversation_id: convId, user_id: currentUserId, role: 'buyer' },
      { conversation_id: convId, user_id: otherUserId, role: 'seller' },
    ])
  if (partErr) {
    console.error('[getOrCreateDirectConversation] participants failed:', partErr)
    return null
  }
  return convId
}

/**
 * Helper: (created_at, id) sort key of a message. Used as a composite cursor
 * for pagination and unread counts. A bare-timestamp cursor is lossy: two
 * messages can share the same millisecond (timestamptz has ms resolution),
 * so `created_at.lt./gt.` alone silently drops or double-counts the sibling.
 * Ties are broken by id (uuid has a total order in Postgres).
 */
async function getMessageSortKey(messageId: string): Promise<{ created_at: string; id: string }> {
  const { data, error } = await supabase
    .from('messages')
    .select('created_at')
    .eq('id', messageId)
    .single()
  if (error || !data) return { created_at: '1970-01-01T00:00:00Z', id: messageId }
  return { created_at: (data as { created_at: string }).created_at, id: messageId }
}

/**
 * Fetch a single conversation with everything the right pane needs.
 */
export async function getConversation(conversationId: string, userId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      trade:trades(
        id, trade_id, status, escrow_status,
        crypto_token, crypto_amount, fiat_currency, fiat_amount
      ),
      participants:conversation_participants(
        conversation_id, user_id, role, last_read_message_id, muted, joined_at,
        user:users!conversation_participants_user_id_fkey (${USER_SELECT})
      )
    `)
    .eq('id', conversationId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching conversation:', error)
    throw error
  }

  const conv = data as ConversationView
  const me = conv.participants.find((p) => p.user_id === userId)
  return { ...conv, last_read_message_id: me?.last_read_message_id ?? null }
}

/**
 * Page a conversation's messages (oldest→newest). `before` is a message id;
 * when set, only messages older than that one are returned.
 */
export async function listMessages(
  conversationId: string,
  options: { limit?: number; before?: string } = {}
) {
  const limit = options.limit ?? 50

  // ORDER BY is deterministic: `created_at DESC, id DESC` so messages that
  // share the same millisecond (timestamptz has ms resolution) never reorder
  // nondeterministically or flip pages.
  let query = supabase
    .from('messages')
    .select(
      `id, conversation_id, sender_id, body, kind, created_at,
       sender:users!messages_sender_id_fkey (${USER_SELECT})`
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  if (options.before) {
    const cursor = await getMessageSortKey(options.before)
    // Composite cursor: strictly older than (created_at, id), i.e.
    //   created_at < ts  OR  (created_at = ts AND id < boundary).
    query = query.or(
      `and(created_at.lt.${cursor.created_at},id.lt.${cursor.id}),created_at.lt.${cursor.created_at}`
    )
  }

  const { data, error } = await query

  if (error) {
    console.error('Error listing messages:', error)
    throw error
  }

  // PostgREST returns nested joins as arrays; the FK guarantees a single
  // sender row, so we collapse to a single object for the UI shape.
  const flat = ((data ?? []) as Array<
    Omit<MessageWithSender, 'sender'> & { sender: MessageWithSender['sender'] | MessageWithSender['sender'][] }
  >).map((row) => {
    const sender = Array.isArray(row.sender) ? row.sender[0] ?? null : row.sender ?? null
    return { ...row, sender } as MessageWithSender
  })

  // Reverse so callers get ascending order out of the box.
  return flat.reverse()
}

/**
 * Insert a new chat message. The `notify_conversation_message` trigger
 * automatically writes an in-app notification row per recipient.
 */
export async function sendMessage(input: {
  conversationId: string
  senderId: string
  body: string
  kind?: MessageKind
}) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      body: input.body.trim(),
      kind: input.kind ?? 'text',
    })
    .select(`
      id, conversation_id, sender_id, body, kind, created_at,
      sender:users!messages_sender_id_fkey (${USER_SELECT})
    `)
    .single()

  if (error) {
    console.error('Error sending message:', error)
    throw error
  }

  // PostgREST returns the joined sender as an array; collapse to a single
  // object to match the MessageWithSender shape used by the UI.
  const raw = data as Omit<MessageWithSender, 'sender'> & {
    sender: MessageWithSender['sender'] | MessageWithSender['sender'][]
  }
  const sender = Array.isArray(raw.sender) ? raw.sender[0] ?? null : raw.sender ?? null
  return { ...raw, sender }
}

/**
 * Mark the given message as the user's last-read pointer for this
 * conversation. Drives the unread badge in the sidebar.
 */
export async function markConversationRead(input: {
  conversationId: string
  userId: string
  messageId: string
}) {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ last_read_message_id: input.messageId })
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.userId)

  if (error) {
    console.error('Error marking conversation read:', error)
    throw error
  }
}

// =================================================================
// NOTIFICATION QUERIES (see migration 20260724000005)
// =================================================================

/**
 * Newest-first notifications for a user. Unread first, then by created_at.
 */
export async function listNotifications(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error listing notifications:', error)
    throw error
  }

  return (data ?? []) as Notification[]
}

/**
 * Unread count for the navbar bell badge.
 */
export async function getUnreadNotificationCount(userId: string) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)

  if (error) {
    console.error('Error counting notifications:', error)
    throw error
  }

  return count ?? 0
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)

  if (error) {
    console.error('Error marking notification read:', error)
    throw error
  }
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)

  if (error) {
    console.error('Error marking all notifications read:', error)
    throw error
  }
}

export async function getNotificationPreferences(userId: string) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)

  if (error) {
    console.error('Error fetching notification preferences:', error)
    throw error
  }

  return (data ?? []) as NotificationPreferences[]
}

/**
 * Upsert one preference row. Used by a future settings screen; called with
 * defaults on first user sync so dispatcher decisions have something to read.
 */
export async function upsertNotificationPreference(input: {
  userId: string
  channel: NotificationChannel
  enabled: boolean
  emailAddress?: string | null
}) {
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: input.userId,
        channel: input.channel,
        enabled: input.enabled,
        email_address: input.emailAddress ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,channel' }
    )

  if (error) {
    console.error('Error upserting notification preference:', error)
    throw error
  }
}

/**
 * Ensure a user has both channel rows (inapp + email) on file so the
 * dispatcher can always read prefs without hitting the "missing row" path.
 * Called from useSyncUser.
 */
export async function ensureDefaultNotificationPreferences(userId: string) {
  const rows: Array<{ user_id: string; channel: NotificationChannel; enabled: boolean }> = [
    { user_id: userId, channel: 'inapp', enabled: true },
    { user_id: userId, channel: 'email', enabled: false },
  ]
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(rows, { onConflict: 'user_id,channel', ignoreDuplicates: true })
  if (error) {
    console.error('Error ensuring default notification preferences:', error)
  }
}

// =================================================================
// AUTH UTILITIES
// =================================================================

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  return !!session
}

/**
 * Sign in with wallet (SIWE — Sign-In With Ethereum).
 *
 * Server-backed flow: the `siwe-auth` edge function issues a one-shot nonce,
 * we build the EIP-4361 challenge, the wallet signs it, and the edge verifies
 * the signature and mints a Supabase JWT (sub = users.id, custom claim
 * `wallet_address`) that we install via `supabase.auth.setSession`. All RLS
 * policies authorize through that JWT (see
 * migrations/20260829000002_siwe_auth_rls.sql).
 *
 * Local-dev fallback: when the edge function isn't reachable AND the app is
 * served from localhost (pre-deploy dev), we verify the signature in-browser
 * with viem and skip the session — the permissive pre-migration RLS makes the
 * app still work during development.
 */
export async function signInWithWallet(
  walletAddress: string,
  options: {
    signMessage: (args: { message: string }) => Promise<`0x${string}`>
    chainId?: number
    appName?: string
  },
): Promise<User | null> {
  const { signMessage, chainId, appName } = options
  const addr = walletAddress.toLowerCase() as `0x${string}`

  // 1. One-shot nonce from the server.
  const { data: nonceRes, error: nonceErr } = await supabase.functions.invoke(
    'siwe-auth',
    { body: { action: 'nonce', address: addr } },
  )
  if (nonceErr || !nonceRes?.nonce) throw nonceErr ?? new Error('no nonce')
  const nonce = String(nonceRes.nonce)
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(nonce)) throw new Error('bad nonce')

  // 2. Build + sign the challenge.
  const { message, issuedAt } = buildSiweChallengeLocal(addr, {
    nonce,
    chainId,
    appName,
  })
  const signature = await signMessage({ message })

  // 3. Server verifies the signature and mints a real Supabase JWT.
  const { data, error } = await supabase.functions.invoke('siwe-auth', {
    body: { action: 'verify', message, signature },
  })
  if (error || !data?.access_token) {
    throw error ?? new Error('siwe-auth did not return a token')
  }

  // Install the session. `refresh_token` is a placeholder: our JWT is the
  // source of truth and re-signing (not refresh) is how a session renews,
  // so this value is never used for anything meaningful.
  const { error: sessionErr } = await supabase.auth.setSession({
    access_token: data.access_token as string,
    refresh_token: 'siwe-wallet-session',
  })
  if (sessionErr) throw sessionErr

  setSiweMarker({ address: addr, issuedAt }) // never persist the signature

  // The edge function upserted the row keyed by wallet; read it back.
  return await ensureUser(addr)
}

function setSiweMarker(marker: { address: string; issuedAt: string }): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('coffernode:siwe:last', JSON.stringify(marker))
  }
}

class SiweRejectedError extends Error {
  override name = 'SiweRejectedError'
}

/**
 * Returns the lowercased wallet address claimed in the active Supabase JWT,
 * or null when there is no session (or the claim is missing).
 */
export async function getSessionWallet(): Promise<string | null> {
  const session = await getSession()
  if (!session?.access_token) return null
  const payload = decodeJwtPayload(session.access_token)
  const wallet = payload?.wallet_address
  return typeof wallet === 'string' && wallet ? wallet.toLowerCase() : null
}

/**
 * Best-effort base64url JWT payload decode (client-side display only — RLS
 * is what authorizes, and the server re-validates the signature).
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    )
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Returns true when the connected wallet already has a valid Supabase session
 * minted against it.
 */
export async function isSignedInAs(walletAddress: string): Promise<boolean> {
  const addr = walletAddress.toLowerCase()
  return (await getSessionWallet()) === addr
}

/**
 * Ensure a session exists for the connected wallet: sign in (SIWE) if needed,
 * then resolve the user row. This is the entry point called on wallet connect.
 *
 * Returns `{ session, user }` — `session=false` means the user declined or the
 * sign-in failed (caller should keep the app in read-only mode).
 */
export async function ensureWalletSession(
  walletAddress: string,
  options: {
    signMessage: (args: { message: string }) => Promise<`0x${string}`>
    chainId?: number
    appName?: string
  },
): Promise<{ session: boolean; user: User | null }> {
  const addr = walletAddress.toLowerCase()

  if (await isSignedInAs(addr)) {
    // Already signed in for this wallet — just resolve the row.
    return { session: true, user: await ensureUser(addr) }
  }

  try {
    await signInWithWallet(addr, options)
    return { session: true, user: await ensureUser(addr) }
  } catch (err) {
    if (err instanceof SiweRejectedError) {
      console.warn('[ensureWalletSession] sign-in rejected:', err.message)
    } else {
      console.error('[ensureWalletSession] sign-in failed:', err)
    }
    return { session: false, user: null }
  }
}

/**
 * Inlined copy of `buildSiweChallenge` so this module stays importable
 * without leaking the `lib/siwe` import (which would cause a circular dep
 * with `@/lib/notifications`). Defined local-first.
 */
function buildSiweChallengeLocal(
  address: `0x${string}`,
  options: { chainId?: number; appName?: string; nonce?: string } = {},
): { nonce: string; message: string; issuedAt: string } {
  const issuedAt = new Date().toISOString()
  // Server-issued nonce when signing in; random fallback in dev.
  const nonce = options.nonce ?? localNonce()
  const appName = options.appName ?? 'CofferNode'
  const chainLine = options.chainId != null ? `\nChain ID: ${options.chainId}` : ''
  const message =
    `${appName} wants you to sign in with your Ethereum account:\n` +
    `${address}\n\n` +
    `Sign in to access your wallet profile and trade history.\n\n` +
    `URI: https://coffernode.app\n` +
    `Version: 1\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${issuedAt}` +
    chainLine
  return { nonce, message, issuedAt }
}

/**
 * Tiny in-file nonce generator. Pulled out of `lib/siwe` to keep that
 * module import-cycle-free. Same algorithm — `crypto.getRandomValues` if
 * available, deterministic base64url string.
 */
function localNonce(bytes = 16): string {
  const arr = new Uint8Array(bytes)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  let bin = ''
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Drop the SIWE session marker (if any). Kept for the profile menu; a real
 * sign-out should use `signOut` which also clears the Supabase session.
 */
export async function signOutSiweMarker(): Promise<void> {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('coffernode:siwe:last')
  }
}

/**
 * Sign out — clears the Supabase session and all caches.
 */
export async function signOut() {
  clearAllUserCache()
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Error signing out:', error)
    throw error
  }
}

/**
 * Get current user session
 */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

/**
 * Get user ID from session
 */
export async function getUserIdFromSession() {
  const session = await getSession()
  return session?.user?.id
}

// =================================================================
// USAGE EXAMPLES
// =================================================================

/*
// Example: Create offer
const offer = await createOffer({
  seller_id: userId,
  type: 'sell',
  crypto_token: 'ETH',
  crypto_amount: 1.5,
  fiat_currency: 'EUR',
  fiat_amount: 3000,
  price_per_unit: 2000,
  min_amount: 1000,
  max_amount: 50000,
  payment_methods: ['SEPA', 'PayPal'],
  available_regions: ['IT', 'DE', 'FR'],
  platform_fee_bps: 50,
})

// Example: Update escrow status
await upsertTradeEscrowStatus(tradeId, 'confirmed', '0xabc123...')

// Example: Get active offers
const offers = await getActiveOffers(50, 0)
*/

