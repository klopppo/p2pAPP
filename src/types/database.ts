/**
 * Database Types - CofferNode P2P Crypto Platform
 * Based on the PostgreSQL schema
 * @packageDocumentation
 */

// =================================================================
// CORE ENUMS
// =================================================================

type EscrowStatus =
  | "awaiting_deposit"
  | "buyer_deposited"
  | "seller_deposited"
  | "funded"
  | "confirmed"
  | "deposited"
  | "pending_release"
  | "disputed"
  | "released"
  | "refunded"
  | "cancelled"

/**
 * Kleros-specific event types that power the trade_events audit log. These
 * extend the existing event_type enum (`dispute_raised`, `appeal_funded`,
 * etc.) so granular per-event trails are recorded by the server-side indexer
 * (planned in docs/todo.md).
 */
export const TradeEventType = {
  OFFER_CREATED: "offer_created",
  OFFER_ACCEPTED: "offer_accepted",
  OFFER_COMPLETED: "offer_completed",
  OFFER_CANCELLED: "offer_cancelled",
  OFFER_EXPIRED: "offer_expired",
  PAYMENT_SENT: "payment_sent",
  CRYPTO_SENT: "crypto_sent",
  ESCROW_DEPOSITED: "escrow_deposited",
  ESCROW_CONFIRMED: "escrow_confirmed",
  ESCROW_RELEASED: "escrow_released",
  ESCROW_REFUNDED: "escrow_refunded",
  ESCROW_DISPUTED: "escrow_disputed",
  ESCROW_RESOLVED: "escrow_resolved",
  ESCROW_CANCELLED: "escrow_cancelled",
  ESCROW_FUNDED: "escrow_funded",
  RATING_SUBMITTED: "rating_submitted",
  DISPUTE_OPENED: "dispute_opened",
  DISPUTE_RAISED: "dispute_raised",
  DISPUTE_RESOLVED: "dispute_resolved",
  DISPUTE_TIMED_OUT: "dispute_timed_out",
  DISPUTE_FINALIZED: "dispute_finalized",
  EVIDENCE_SUBMITTED: "evidence_submitted",
  APPEAL_FUNDED: "appeal_funded",
  RULING_RECEIVED: "ruling_received",
  RULING_EXECUTED: "ruling_executed",
  FUNDS_RETURNED: "funds_returned",
  CANCELLATION: "cancellation",
  REFUND_ISSUED: "refund_issued",
  /** Generic fallback for transitions that don't have a dedicated value above. */
  ESCROW_STATUS_UPDATED: "escrow_status_updated",
  TRADE_STATUS_UPDATED: "trade_status_updated",
} as const
export type TradeEventType =
  (typeof TradeEventType)[keyof typeof TradeEventType]

type OfferStatus = "active" | "paused" | "completed" | "cancelled" | "expired"

type VerificationLevel = "unverified" | "verified" | "trusted" | "suspicious"

type UserRole = "user" | "admin" | "mediator" | "support"

export const TradeStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  DISPUTED: "disputed",
  REFUNDED: "refunded",
} as const
export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus]

export const DisputeStatus = {
  OPEN: "open",
  IN_REVIEW: "in_review",
  RESOLVED: "resolved",
  ESCALATED: "escalated",
  CLOSED: "closed",
} as const
export type DisputeStatus = (typeof DisputeStatus)[keyof typeof DisputeStatus]

// =================================================================
// USER TYPES
// =================================================================

export interface User {
  id: string
  wallet_address: string
  /** Opaque public label (`CN-<hex>`), unique per user (ADR-015). Safe to
   *  show on public surfaces: cannot be inverted to a wallet or uid. */
  public_handle: string | null
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

  // Denormalized stats — optional because older rows may not have them yet.
  // Populated by server-side aggregation; the UI gracefully renders 0/— when
  // null. Mirror the column names in supabase migrations if you add/rename any.
  unique_traders?: number
  total_volume?: number | null
  last_30d_trades?: number
  last_30d_volume?: number | null
}

// =================================================================
// OFFER TYPES
// =================================================================

export interface Offer {
  id: string
  offer_id: string
  seller_id: string
  status: OfferStatus
  type: "buy" | "sell"

  crypto_token: string
  crypto_amount: number
  fiat_currency: string
  fiat_amount: number
  price_per_unit: number

  min_amount: number
  max_amount: number
  payment_methods: string[]
  available_regions: string[]

  /** Target-only offer (migration 20260830000001). Private rows are readable
   *  only by the seller and `target_user`; a target_user always implies
   *  is_private = true (DB CHECK). */
  is_private: boolean
  /** 20-byte ETH address of the single candidate who may accept this offer. */
  target_user: string | null

  /** Escrow grace window in HOURS after the buyer confirms the off-chain
   *  payment (migration 20260914000000). Converted to seconds when the escrow
   *  is deployed (TradePage: `grace_period * 3600`). */
  grace_period: number

  platform_fee_bps: number
  network_fee: number

  premium_multiplier: number | null
  tags: string[]
  featured: boolean
  description: string | null

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
  /** Deployed KlerosEsc clone address; set when the trade is created via
   *  KlerosEscrowFactory.createEscrow(). See src/lib/contracts.ts. */
  escrow_contract_addr?: string | null
  /** Role of the user opening the trade — used for the offer_accepted event. */
  taker_role: "buyer" | "seller"
  /** msg.sender of KlerosEscrowFactory.createEscrow() (the taker in the
   *  typical flow). Optional but useful for audits / indexer joins. */
  creator?: string | null
  /** Pinned Kleros Court address (factory-owned). Optional — read from the
   *  factory contract and persisted here so the server-side indexer doesn't
   *  have to re-read the chain per row. */
  kleros_court_addr?: string | null
  kleros_extra_data_part1?: string | null
  kleros_extra_data_part2?: string | null
}

export interface TradeRating {
  id: string
  trade_id: string
  rater_id: string
  rated_id: string
  direction: "buyer" | "seller"
  score: number
  comment: string | null
  anonymous: boolean
  submitted_at: string
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

  // Kleros / on-chain mirrors. Optional because the columns may not exist
  // in older deployments; the Supabase row is a cache of the on-chain
  // KlerosEsc + Kleros Court state. See src/lib/contracts.ts.
  /** Deployed KlerosEsc clone for the underlying trade. */
  escrow_address?: string | null
  /** Kleros dispute ID assigned by KlerosCourt.createDispute(). */
  kleros_dispute_id?: string | null
  /** Tx hash of the raiseDispute() call that created this dispute. */
  tx_hash?: string | null
  /** Tx hash of the submitEvidence() call (if any). */
  tx_hash_evidence?: string | null
  /** Cached KlerosCourt.DisputeStatus (0 Waiting, 1 Appealable, 2 Solved). */
  kleros_dispute_status?: number | null
  /** Cached KlerosEsc.State (uint8) at the time of the last update. */
  escrow_state?: number | null
  /** Cached ruling (Ruling enum, 0..4) at the time of the last update. */
  on_chain_ruling?: number | null
  /** IPFS CID of the primary evidence image (for off-chain display). */
  evidence_cid?: string | null
  // New indexer-shaped columns. Optional for back-compat with old DBs.
  /** ERC-1497 evidence-group counter (0 = first round, increments per appeal). */
  evidence_group_id?: number | null
  /** Number of appeal rounds completed against this Kleros dispute. */
  appeal_count?: number | null
  /** Which party raised the dispute ('buyer' | 'seller'). */
  raiser?: "buyer" | "seller" | null
  /** ETH wei forwarded to KlerosCourt.createDispute() (stored as text). */
  fee_paid_wei?: string | null
  /** 'buyer' | 'seller' — populated by DisputeTimedOut event. */
  winner?: "buyer" | "seller" | null
  /** KlerosEsc.disputeTimestamp (unix seconds). */
  dispute_timestamp?: string | null
  /** KlerosEsc.rulingReceivedTime (unix seconds). */
  ruling_received_time?: string | null
}

// =================================================================
// CHAT TYPES (conversations + messages, see migration 20260724000004)
// =================================================================

type ConversationStatus = "open" | "archived" | "locked"

type ParticipantRole = "buyer" | "seller" | "mediator" | "observer"

export type MessageKind = "text" | "system" | "payment_hint"

interface Conversation {
  id: string
  trade_id: string | null
  status: ConversationStatus
  last_message_at: string | null
  last_message_preview: string | null
  created_at: string
  updated_at: string
}

interface ConversationParticipant {
  conversation_id: string
  user_id: string
  role: ParticipantRole
  last_read_message_id: string | null
  muted: boolean
  joined_at: string
}

interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  kind: MessageKind
  created_at: string
}

/**
 * Conversation joined with participants + the other party's profile, the
 * linked trade summary, and the current user's unread count. This is the
 * shape the UI consumes — keep server functions returning this so the
 * frontend never has to do its own N+1 joins.
 */
export interface ConversationView extends Conversation {
  participants: ConversationWithParticipant[]
  trade: {
    id: string
    trade_id: string
    status: TradeStatus
    escrow_status: EscrowStatus
    escrow_contract_addr: string | null
    crypto_token: string
    crypto_amount: number
    fiat_currency: string
    fiat_amount: number
  } | null
  unread_count: number
  last_read_message_id: string | null
}

export interface ConversationWithParticipant extends ConversationParticipant {
  user: Pick<
    User,
    | "id"
    | "wallet_address"
    | "nickname"
    | "avatar_url"
    | "verification_level"
    | "last_active_at"
  >
}

export interface MessageWithSender extends Message {
  sender: Pick<
    User,
    "id" | "wallet_address" | "nickname" | "avatar_url" | "verification_level"
  >
}

// =================================================================
// NOTIFICATION TYPES (see migration 20260724000005)
// =================================================================

export type NotificationKind =
  | "message"
  | "trade_update"
  | "dispute_update"
  | "system"

export type NotificationChannel = "inapp" | "email"

export interface Notification {
  id: string
  user_id: string
  kind: NotificationKind
  conversation_id: string | null
  message_id: string | null
  trade_id: string | null
  title: string
  body: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface NotificationPreferences {
  user_id: string
  channel: NotificationChannel
  enabled: boolean
  email_address: string | null
  updated_at: string
}

// =================================================================
// REFERRAL PROGRAM
// =================================================================

type ReferralStatus = "pending" | "active"

type ReferralRewardStatus = "pending" | "paid"

interface ReferralRelation {
  id: string
  referrer_id: string
  referred_user_id: string
  code: string
  status: ReferralStatus
  attributed_at: string
}

export interface ReferralRelationWithUser extends ReferralRelation {
  referred?: {
    wallet_address: string
    nickname: string | null
    avatar_url: string | null
  } | null
}

export interface ReferralFeeEvent {
  id: string
  trade_id: string
  referrer_id: string
  referred_user_id: string
  fee_bps: number
  fee_amount: number
  referrer_share_bps: number
  earned_amount: number
  status: ReferralRewardStatus
  created_at: string
}

export interface ReferralDashboard {
  code: string | null
  referred: ReferralRelationWithUser[]
  events: ReferralFeeEvent[]
  totalEarned: number
  pendingEarned: number
  paidEarned: number
}
