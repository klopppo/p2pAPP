/**
 * Database Types - P2P Crypto Platform
 * Based on the PostgreSQL schema
 * @packageDocumentation
 */

// =================================================================
// CORE ENUMS
// =================================================================

export enum EscrowStatus {
  AWAITING_DEPOSIT = 'awaiting_deposit',
  DEPOSITED = 'deposited',
  PENDING_RELEASE = 'pending_release',
  DISPUTED = 'disputed',
  RELEASED = 'released',
  REFUNDED = 'refunded',
}

export enum OfferStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum KYCStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export enum VerificationLevel {
  UNVERIFIED = 'unverified',
  VERIFIED = 'verified',
  TRUSTED = 'trusted',
  SUSPICIOUS = 'suspicious',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  MEDIATOR = 'mediator',
  SUPPORT = 'support',
}

export enum TradeStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed',
  REFUNDED = 'refunded',
}

export enum DisputeStatus {
  OPEN = 'open',
  IN_REVIEW = 'in_review',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated',
  CLOSED = 'closed',
}

// =================================================================
// USER TYPES
// =================================================================

export interface User {
  id: string
  wallet_address: string
  role: UserRole
  created_at: string
  updated_at: string

  // Public fields
  nickname: string | null
  avatar_url: string | null
  bio: string | null
  location: string | null
  website: string | null
  twitter_handle: string | null
  telegram_handle: string | null
  github_handle: string | null

  // Cached metrics
  verification_level: VerificationLevel
  reputation_score: number
  total_trades: number
  completed_trades: number
  cancelled_trades: number
  dispute_count: number
  avg_rating: number
  last_active_at: string | null
}

export interface UserPrivate {
  user_id: string
  email: string | null
  email_verified_at: string | null
  phone_encrypted: string | null  // Base64 encoded
  wallet_privkey_enc: string | null  // Base64 encrypted
  kyc_id: string | null
  twofa_enabled: boolean
  twofa_secret_enc: string | null  // Base64 encrypted
  backup_codes_enc: string | null  // Base64 encrypted
  daily_limit: number | null
  weekly_limit: number | null
  daily_used: number
  weekly_used: number
  wallet_lock_enabled: boolean
  wallet_lock_threshold: number
  wallet_lock_last_unlock: string | null
  last_password_change: string
}

// =================================================================
// KYC TYPES
// =================================================================

export enum KYCDocType {
  PASSPORT = 'passport',
  ID_CARD = 'id_card',
  DRIVING_LICENSE = 'driving_license',
  NATIONAL_ID = 'national_id',
}

export interface KYCApplication {
  id: string
  user_id: string
  status: KYCStatus
  doc_type: KYCDocType
  document_number: string
  issuing_country: string
  issue_date: string | null
  expiry_date: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
}

export interface KYCDocument {
  id: string
  kyc_id: string
  doc_kind: 'selfie' | 'front' | 'back'
  file_hash: string  // SHA-256 hex
  file_encrypted: string  // Base64 encrypted
  uploaded_at: string
}

export interface KYCProvider {
  id: string
  kyc_id: string
  provider_name: string
  status: KYCStatus
  provider_ref: string | null
  metadata: Record<string, any>
  verified_at: string | null
}

// =================================================================
// OFFER TYPES
// =================================================================

export interface Offer {
  id: string
  offer_id: string
  seller_id: string
  status: OfferStatus
  type: 'buy' | 'sell'

  crypto_token: string
  crypto_amount: number
  fiat_currency: string
  fiat_amount: number
  price_per_unit: number

  min_amount: number
  max_amount: number
  payment_methods: string[]
  available_regions: string[]

  platform_fee_bps: number
  network_fee: number

  premium_multiplier: number | null
  tags: string[]
  featured: boolean

  published_at: string
  expires_at: string | null
  views: number
  clicks: number

  created_at: string
  updated_at: string
}

// =================================================================
// TRADE TYPES
// =================================================================

export interface Trade {
  id: string
  trade_id: string
  offer_id: string | null
  status: TradeStatus

  buyer_id: string
  seller_id: string

  // Trading details
  crypto_token: string
  crypto_amount: number
  crypto_price_per_unit: number
  crypto_total: number

  fiat_currency: string
  fiat_amount: number
  fiat_received: number

  payment_method: string
  payment_details: Record<string, any>

  // Escrow contract details
  escrow_contract_addr: string | null
  escrow_tx_hash: string | null
  escrow_status: EscrowStatus

  // Unlock configuration
  escrow_timeout: string
  escrow_release_after: string

  // Platform fee tracking
  platform_fee_bps: number
  treasury_address: string | null

  // Dispute tracking
  has_dispute: boolean

  // Rating aggregated
  avg_rating: number | null
  rating_speed: number | null
  rating_communication: number | null
  rating_reliability: number | null

  // Timestamps
  created_at: string
  updated_at: string
  completed_at: string | null
  cancelled_at: string | null
  disputed_at: string | null
}

/**
 * Input for creating a trade from an offer. `crypto_amount` is derived from the
 * entered `fiat_amount` and the offer's `price_per_unit`; the DB recomputes
 * `crypto_total` via its generated column.
 */
export interface CreateTradeInput {
  offer_id: string | null
  buyer_id: string
  seller_id: string
  crypto_token: string
  crypto_amount: number
  crypto_price_per_unit: number
  fiat_currency: string
  fiat_amount: number
  payment_method: string
  payment_details?: Record<string, unknown>
  platform_fee_bps: number
  treasury_address?: string | null
  /** Role of the user opening the trade — used for the offer_accepted event. */
  taker_role: 'buyer' | 'seller'
}

export interface TradeRating {
  id: string
  trade_id: string
  rater_id: string
  rated_id: string
  direction: 'buyer' | 'seller'
  score: number
  comment: string | null
  anonymous: boolean
  submitted_at: string
}

export interface TradeEvent {
  id: string
  trade_id: string
  type: string
  actor: string
  description: string | null
  metadata: Record<string, any>
  created_at: string
}

// =================================================================
// DISPUTE TYPES
// =================================================================

export interface Dispute {
  id: string
  dispute_id: string
  trade_id: string
  buyer_id: string
  seller_id: string
  status: DisputeStatus
  reason: string
  reason_category: string
  description: string
  can_appeal: boolean
  appeal_deadline: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export interface DisputeEvidence {
  id: string
  dispute_id: string
  submitted_by: 'buyer' | 'seller' | 'neutral'
  evidence_kind: string
  file_hash: string
  file_encrypted: string
  submitted_at: string
}

// =================================================================
// REPUTATION TYPES
// =================================================================

export interface ReputationScore {
  user_id: string
  overall: number
  trustworthiness: number
  reliability: number
  communication: number
  speed: number
  professionalism: number
  points_total: number
  points_earned: number
  points_lost: number
  updated_at: string
}

export interface ReputationPoint {
  id: string
  user_id: string
  category: string
  delta: number
  reason: string
  source: 'trade' | 'rating' | 'dispute' | 'flag' | 'system'
  created_at: string
}

export interface ReputationBadge {
  user_id: string
  badge: string
  awarded_at: string
}

// =================================================================
// LOGIN SESSION TYPES
// =================================================================

export interface LoginSession {
  id: string
  user_id: string
  ip: string | null
  user_agent: string | null
  fingerprint: string | null
  created_at: string
  last_used_at: string
  revoked_at: string | null
}

// =================================================================
// STUDIO-SAFE MOCKS (for development)
// =================================================================

export interface MockOffer {
  id: number
  trader: string
  trades: number
  type: 'buy' | 'sell'
  token: string
  amount: string
  price: number
  priceDisplay: string
  minAmount: number
  maxAmount: number
  isPositive: boolean
}
