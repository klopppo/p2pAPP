type EscrowStatus =
  | "awaiting_deposit" | "buyer_deposited" | "seller_deposited" | "funded"
  | "confirmed" | "deposited" | "pending_release" | "disputed"
  | "released" | "refunded" | "cancelled"

export const TradeEventType = {
  OFFER_CREATED: "offer_created", OFFER_ACCEPTED: "offer_accepted",
  OFFER_COMPLETED: "offer_completed", OFFER_CANCELLED: "offer_cancelled",
  OFFER_EXPIRED: "offer_expired", PAYMENT_SENT: "payment_sent",
  CRYPTO_SENT: "crypto_sent", ESCROW_DEPOSITED: "escrow_deposited",
  ESCROW_CONFIRMED: "escrow_confirmed", ESCROW_RELEASED: "escrow_released",
  ESCROW_REFUNDED: "escrow_refunded", ESCROW_DISPUTED: "escrow_disputed",
  ESCROW_RESOLVED: "escrow_resolved", ESCROW_CANCELLED: "escrow_cancelled",
  ESCROW_FUNDED: "escrow_funded", RATING_SUBMITTED: "rating_submitted",
  DISPUTE_OPENED: "dispute_opened", DISPUTE_RAISED: "dispute_raised",
  DISPUTE_RESOLVED: "dispute_resolved", DISPUTE_TIMED_OUT: "dispute_timed_out",
  DISPUTE_FINALIZED: "dispute_finalized", EVIDENCE_SUBMITTED: "evidence_submitted",
  APPEAL_FUNDED: "appeal_funded", RULING_RECEIVED: "ruling_received",
  RULING_EXECUTED: "ruling_executed", FUNDS_RETURNED: "funds_returned",
  CANCELLATION: "cancellation", REFUND_ISSUED: "refund_issued",
  ESCROW_STATUS_UPDATED: "escrow_status_updated", TRADE_STATUS_UPDATED: "trade_status_updated",
} as const
export type TradeEventType = (typeof TradeEventType)[keyof typeof TradeEventType]

type OfferStatus = "active" | "paused" | "completed" | "cancelled" | "expired"

type VerificationLevel = "unverified" | "verified" | "trusted" | "suspicious"

type UserRole = "user" | "admin" | "mediator" | "support"

export const TradeStatus = {
  PENDING: "pending", ACTIVE: "active", COMPLETED: "completed",
  CANCELLED: "cancelled", DISPUTED: "disputed", REFUNDED: "refunded",
} as const
export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus]

export const DisputeStatus = {
  OPEN: "open", IN_REVIEW: "in_review", RESOLVED: "resolved",
  ESCALATED: "escalated", CLOSED: "closed",
} as const
export type DisputeStatus = (typeof DisputeStatus)[keyof typeof DisputeStatus]

export interface User {
  id: string; wallet_address: string; public_handle: string | null; role: UserRole
  created_at: string; updated_at: string
  nickname: string | null; avatar_url: string | null; bio: string | null; location: string | null
  website: string | null; twitter_handle: string | null; telegram_handle: string | null
  github_handle: string | null
  verification_level: VerificationLevel; reputation_score: number
  total_trades: number; completed_trades: number; cancelled_trades: number
  dispute_count: number; avg_rating: number; last_active_at: string | null
  unique_traders?: number; total_volume?: number | null
  last_30d_trades?: number; last_30d_volume?: number | null
}

export interface Offer {
  id: string; offer_id: string; seller_id: string; status: OfferStatus; type: "buy" | "sell"
  crypto_token: string; crypto_amount: number; fiat_currency: string; fiat_amount: number
  price_per_unit: number; min_amount: number; max_amount: number
  payment_methods: string[]; available_regions: string[]
  is_private: boolean; target_user: string | null; grace_period: number
  platform_fee_bps: number; network_fee: number
  premium_multiplier: number | null; tags: string[]; featured: boolean; description: string | null
  published_at: string; expires_at: string | null; views: number; clicks: number
  created_at: string; updated_at: string
}

export interface CreateTradeInput {
  offer_id: string | null; buyer_id: string; seller_id: string
  crypto_token: string; crypto_amount: number; crypto_price_per_unit: number
  fiat_currency: string; fiat_amount: number; payment_method: string
  payment_details?: Record<string, unknown>; platform_fee_bps: number
  treasury_address?: string | null; escrow_contract_addr?: string | null
  taker_role: "buyer" | "seller"; creator?: string | null
  kleros_court_addr?: string | null
  kleros_extra_data_part1?: string | null; kleros_extra_data_part2?: string | null
}

export interface TradeRating {
  id: string; trade_id: string; rater_id: string; rated_id: string
  direction: "buyer" | "seller"; score: number; comment: string | null
  anonymous: boolean; submitted_at: string
}

export interface Dispute {
  id: string; dispute_id: string; trade_id: string; buyer_id: string; seller_id: string
  status: DisputeStatus; reason: string; reason_category: string; description: string
  can_appeal: boolean; appeal_deadline: string | null
  created_at: string; updated_at: string; resolved_at: string | null
  escrow_address?: string | null; kleros_dispute_id?: string | null
  tx_hash?: string | null; tx_hash_evidence?: string | null
  kleros_dispute_status?: number | null; escrow_state?: number | null
  on_chain_ruling?: number | null; evidence_cid?: string | null
  evidence_group_id?: number | null; appeal_count?: number | null
  raiser?: "buyer" | "seller" | null; fee_paid_wei?: string | null
  winner?: "buyer" | "seller" | null; dispute_timestamp?: string | null
  ruling_received_time?: string | null
}

type ConversationStatus = "open" | "archived" | "locked"

type ParticipantRole = "buyer" | "seller" | "mediator" | "observer"

export type MessageKind = "text" | "system" | "payment_hint"

interface Conversation {
  id: string; trade_id: string | null; status: ConversationStatus
  last_message_at: string | null; last_message_preview: string | null
  created_at: string; updated_at: string
}

interface ConversationParticipant {
  conversation_id: string; user_id: string; role: ParticipantRole
  last_read_message_id: string | null; muted: boolean; joined_at: string
}

interface Message {
  id: string; conversation_id: string; sender_id: string; body: string
  kind: MessageKind; created_at: string
}

export interface ConversationView extends Conversation {
  participants: ConversationWithParticipant[]
  trade: {
    id: string; trade_id: string; status: TradeStatus; escrow_status: EscrowStatus
    escrow_contract_addr: string | null; crypto_token: string; crypto_amount: number
    fiat_currency: string; fiat_amount: number
  } | null
  unread_count: number; last_read_message_id: string | null
}

export interface ConversationWithParticipant extends ConversationParticipant {
  user: Pick<
    User,
    "id" | "wallet_address" | "nickname" | "avatar_url" | "verification_level" | "last_active_at"
  >
}

export interface MessageWithSender extends Message {
  sender: Pick<User, "id" | "wallet_address" | "nickname" | "avatar_url" | "verification_level">
}

export type NotificationKind = "message" | "trade_update" | "dispute_update" | "system"

export type NotificationChannel = "inapp" | "email"

export interface Notification {
  id: string; user_id: string; kind: NotificationKind
  conversation_id: string | null; message_id: string | null; trade_id: string | null
  title: string; body: string; payload: Record<string, unknown>
  read_at: string | null; created_at: string
}

export interface NotificationPreferences {
  user_id: string; channel: NotificationChannel; enabled: boolean
  email_address: string | null; updated_at: string
}

type ReferralStatus = "pending" | "active"

type ReferralRewardStatus = "pending" | "paid"

interface ReferralRelation {
  id: string; referrer_id: string; referred_user_id: string; code: string
  status: ReferralStatus; attributed_at: string
}

export interface ReferralRelationWithUser extends ReferralRelation {
  referred?: {
    wallet_address: string; nickname: string | null; avatar_url: string | null
  } | null
}

export interface ReferralFeeEvent {
  id: string; trade_id: string; referrer_id: string; referred_user_id: string
  fee_bps: number; fee_amount: number; referrer_share_bps: number
  earned_amount: number; status: ReferralRewardStatus; created_at: string
}

export interface ReferralDashboard {
  code: string | null; referred: ReferralRelationWithUser[]; events: ReferralFeeEvent[]
  totalEarned: number; pendingEarned: number; paidEarned: number
}
