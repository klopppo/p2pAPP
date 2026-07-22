/**
 * Supabase Integration for P2P Crypto Platform
 * @packageDocumentation
 */

import { createClient } from '@supabase/supabase-js'
import type { User, Offer, KYCApplication, Dispute, TradeRating, CreateTradeInput } from '@/types/database'

// Environment variables (these should be set in .env.local)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
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
  DEPOSITED: 'deposited',
  PENDING_RELEASE: 'pending_release',
  DISPUTED: 'disputed',
  RELEASED: 'released',
  REFUNDED: 'refunded',
} as const
export type EscrowStatus = typeof EscrowStatus[keyof typeof EscrowStatus]

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

/**
 * Create or update user profile
 */
export async function upsertUser(
  walletAddress: string,
  nickname?: string,
  avatarUrl?: string,
  bio?: string,
  location?: string
) {
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        wallet_address: walletAddress.toLowerCase(),
        nickname: nickname || null,
        avatar_url: avatarUrl || null,
        bio: bio || null,
        location: location || null,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: 'wallet_address' }
    )
    .select()
    .single()

  if (error) {
    console.error('Error upserting user:', error)
    throw error
  }

  return data as User
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
 * Create a new trade from an offer.
 *
 * Escrow is DB-managed for now (no smart contract): escrow_contract_addr stays
 * null and escrow_status starts at awaiting_deposit. The buyer/seller roles are
 * resolved by the caller based on offer.type (the taker is the opposite party).
 * Logs an `offer_accepted` event using the inserted row's UUID `id` (note:
 * trade_events.trade_id is the UUID primary key, NOT the varchar trade_id).
 */
export async function createTrade(input: CreateTradeInput) {
  const { data, error } = await supabase
    .from('trades')
    .insert({
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
      escrow_contract_addr: null,
      escrow_status: EscrowStatus.AWAITING_DEPOSIT,
      platform_fee_bps: input.platform_fee_bps,
      treasury_address: input.treasury_address ?? null,
    })
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
    `Trade opened by ${input.taker_role}`
  )

  return data
}

/**
 * Update trade escrow status
 */
export async function updateTradeEscrowStatus(
  tradeId: string,
  status: EscrowStatus,
  txHash?: string
) {
  const updates: { escrow_status: EscrowStatus; escrow_tx_hash?: string } = {
    escrow_status: status,
  }

  if (txHash) {
    updates.escrow_tx_hash = txHash
  }

  const { data, error } = await supabase
    .from('trades')
    .update(updates)
    .eq('trade_id', tradeId)
    .select()
    .single()

  if (error) {
    console.error('Error updating trade status:', error)
    throw error
  }

  // Log trade event
  await logTradeEvent(tradeId, 'escrow_status_updated', 'system', `Status changed to ${status}`)

  return data
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
 * Create dispute
 */
export async function createDispute(disputeData: Partial<Dispute>) {
  const { data, error } = await supabase
    .from('disputes')
    .insert({
      ...disputeData,
      status: DisputeStatus.OPEN,
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
 * Sign in with wallet (Magic Link)
 */
export async function signInWithWallet(walletAddress: string) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email: `${walletAddress.toLowerCase()}@wallet.p2p`,
    options: {
      emailRedirectTo: window.location.origin + '/app/verify',
    },
  })

  if (error) {
    console.error('Error signing in with wallet:', error)
    throw error
  }

  return data
}

/**
 * Sign out
 */
export async function signOut() {
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
await updateTradeEscrowStatus(tradeId, 'deposited', '0xabc123...')

// Example: Get active offers
const offers = await getActiveOffers(50, 0)
*/
