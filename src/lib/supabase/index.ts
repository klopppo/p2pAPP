import { createClient } from "@supabase/supabase-js"
import type {
  User, Offer, Dispute, DisputeStatus, TradeRating, CreateTradeInput,
  ConversationView, ConversationWithParticipant, MessageKind, MessageWithSender,
  Notification, NotificationChannel, NotificationPreferences, ReferralDashboard,
  ReferralRelationWithUser, ReferralFeeEvent,
} from "@/types/database"
import {
  getCachedUser, setCachedUser, invalidateUserCache, clearAllUserCache,
} from "@/lib/userCache"
import { persistCofferIdentity } from "@/lib/cofferIdentity"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
// Publishable key preferred; legacy anon JWT fallback. Both are browser-safe.
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY)."
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  db: { schema: "public" },
})

// OD-02: `anon` may SELECT only these columns on users/offers (42501 outside
// the projection). Mirror of functions/_lib/public-data.ts.
export const PUBLIC_USER_COLUMNS = [
  "id", "wallet_address", "public_handle", "nickname", "avatar_url",
  "verification_level", "bio", "avg_rating", "reputation_score", "total_trades",
  "completed_trades", "cancelled_trades", "dispute_count", "created_at",
].join(",")

export const PUBLIC_OFFER_COLUMNS = [
  "id", "offer_id", "status", "type", "crypto_token", "crypto_amount",
  "fiat_currency", "fiat_amount", "price_per_unit", "min_amount", "max_amount",
  "payment_methods", "available_regions", "platform_fee_bps", "network_fee",
  "tags", "description", "is_private", "grace_period", "published_at",
  "expires_at", "created_at",
].join(",")

// Identity-free seller join (ADR-015): opaque public_handle only, never uid/wallet.
export const SELLER_JOIN = [
  "public_handle", "nickname", "avatar_url", "verification_level",
  "total_trades", "avg_rating",
].join(",")

export type SellerProfile = {
  public_handle: string | null
  nickname: string | null
  avatar_url: string | null
  verification_level: VerificationLevel
  total_trades: number
  avg_rating: number
}

export type OfferWithSeller = Offer & { seller?: SellerProfile | null }

type VerificationLevel = "unverified" | "verified" | "trusted" | "suspicious"

export const EscrowStatus = {
  AWAITING_DEPOSIT: "awaiting_deposit", BUYER_DEPOSITED: "buyer_deposited",
  SELLER_DEPOSITED: "seller_deposited", FUNDED: "funded", CONFIRMED: "confirmed",
  DEPOSITED: "deposited", PENDING_RELEASE: "pending_release", DISPUTED: "disputed",
  RELEASED: "released", REFUNDED: "refunded", CANCELLED: "cancelled",
} as const
export type EscrowStatus = (typeof EscrowStatus)[keyof typeof EscrowStatus]

export const TradeEventType = {
  OFFER_ACCEPTED: "offer_accepted", ESCROW_FUNDED: "escrow_funded",
  ESCROW_CONFIRMED: "escrow_confirmed", ESCROW_RELEASED: "escrow_released",
  ESCROW_REFUNDED: "escrow_refunded", ESCROW_DISPUTED: "escrow_disputed",
  ESCROW_RESOLVED: "escrow_resolved", ESCROW_CANCELLED: "escrow_cancelled",
  DISPUTE_RAISED: "dispute_raised", EVIDENCE_SUBMITTED: "evidence_submitted",
  APPEAL_FUNDED: "appeal_funded", RULING_RECEIVED: "ruling_received",
  RULING_EXECUTED: "ruling_executed", DISPUTE_FINALIZED: "dispute_finalized",
  DISPUTE_TIMED_OUT: "dispute_timed_out", FUNDS_RETURNED: "funds_returned",
  ESCROW_STATUS_UPDATED: "escrow_status_updated",
  TRADE_STATUS_UPDATED: "trade_status_updated",
} as const
export type TradeEventType = (typeof TradeEventType)[keyof typeof TradeEventType]

type DbError = { code?: string; message?: string }
type Res<T> = { data: T; error: DbError | null }

function fail(label: string, error: unknown): never {
  console.error(`${label}:`, error)
  throw error
}

// `.single()` wrapper: PGRST116 (no rows) → null when `nullOnMissing`.
async function one<T>(
  q: PromiseLike<Res<T>>,
  label: string,
  nullOnMissing = false
): Promise<T> {
  const { data, error } = await q
  if (error) {
    if (nullOnMissing && error.code === "PGRST116") return null as unknown as T
    fail(label, error)
  }
  return data
}

async function many<T>(
  q: PromiseLike<Res<T[] | null>>,
  label: string
): Promise<T[]> {
  const { data, error } = await q
  if (error) fail(label, error)
  return (data ?? []) as T[]
}

async function ok(
  q: PromiseLike<{ error: DbError | null }>,
  label: string
): Promise<void> {
  const { error } = await q
  if (error) fail(label, error)
}

async function rpcCall<T = unknown>(
  name: string,
  args: Record<string, unknown>,
  label: string
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) fail(label, error)
  return data as T
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_STRICT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (value: string): boolean => UUID_RE.test(value)

// OD-02: `anon` may read only the identity-free projection. A signed-in
// session may additionally read the profile socials (the DB grants
// `authenticated` table-level SELECT after 20260920000005) — ProfilePage renders
// them, so other users' profiles would otherwise show blank socials.
const AUTHENTICATED_USER_COLUMNS = `${PUBLIC_USER_COLUMNS},website,twitter_handle,telegram_handle,github_handle,role,updated_at`

// Own row needs writable-only fields (EditProfilePage); anon must stick to the
// OD-02 projection.
async function userColumnsForRead(walletAddress: string): Promise<string> {
  const sessionWallet = await getSessionWallet()
  if (sessionWallet === walletAddress.toLowerCase()) return "*"
  return sessionWallet ? AUTHENTICATED_USER_COLUMNS : PUBLIC_USER_COLUMNS
}

export async function getUserByWallet(walletAddress: string) {
  const cols = await userColumnsForRead(walletAddress)
  const data = await one(
    supabase
      .from("users")
      .select(cols)
      .eq("wallet_address", walletAddress.toLowerCase())
      .single(),
    "Error fetching user",
    true
  )
  return data as User | null
}

export async function ensureUser(walletAddress: string): Promise<User | null> {
  const addr = walletAddress.toLowerCase()
  const sessionWallet = await getSessionWallet()
  const isSelf = sessionWallet === addr
  const cached = getCachedUser(addr)
  // A cache entry written from the public projection lacks `role` (and the
  // writable/social fields). Don't reuse it for the signed-in owner (the edit
  // form would hydrate empty socials and save them back as null) nor for any
  // signed-in read (other users' profiles would show blank socials).
  const cacheMissingPrivateCols = !!cached && !("role" in cached)
  if (cached && !(cacheMissingPrivateCols && (isSelf || !!sessionWallet))) {
    return cached
  }

  const existing = await one(
    supabase
      .from("users")
      .select(await userColumnsForRead(addr))
      .eq("wallet_address", addr)
      .maybeSingle(),
    "[ensureUser] read error"
  )

  if (existing) {
    // Touch last_active_at fire-and-forget; RLS requires a session to UPDATE.
    supabase
      .from("users")
      .update({ last_active_at: new Date().toISOString() })
      .eq("wallet_address", addr)
      .then(({ error }) => {
        if (error)
          console.warn("[ensureUser] last_active_at update failed:", error)
      })
    const user = existing as unknown as User
    setCachedUser(user)
    return user
  }

  // New user: insert only for the signed-in wallet (RLS rejects otherwise).
  if (sessionWallet !== addr) return null
  const inserted = await one(
    supabase
      .from("users")
      .insert({ wallet_address: addr, last_active_at: new Date().toISOString() })
      .select()
      .single(),
    "[ensureUser] insert error"
  )
  const user = inserted as unknown as User
  setCachedUser(user)
  return user
}

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
  const user = await one(
    supabase
      .from("users")
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
        { onConflict: "wallet_address" }
      )
      .select()
      .single(),
    "[updateUserProfile] error"
  )
  invalidateUserCache(addr)
  setCachedUser(user as User)
  return user as User
}

const AVATAR_BUCKET = "avatars"

export async function uploadAvatar(
  file: File,
  walletAddress: string
): Promise<{ url: string; path: string }> {
  const addr = walletAddress.toLowerCase()
  // Only a plain alphanumeric extension: the raw suffix can carry path
  // separators / `..` / control chars into the storage object name.
  const rawExt = file.name.split(".").pop()?.toLowerCase() ?? ""
  const ext = /^[a-z0-9]+$/.test(rawExt) ? rawExt : "png"
  const path = `${addr}-${Date.now()}.${ext}`

  await ok(
    supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: "3600" }),
    "[uploadAvatar] upload error"
  )
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, path }
}

const DISPUTE_EVIDENCE_BUCKET = "dispute-evidence"
const DISPUTE_EVIDENCE_SIGNED_URL_TTL_SECONDS = 600

interface DisputeEvidenceUpload {
  path: string
  /** @deprecated minted on render via `getDisputeEvidenceSignedUrl`. */
  url?: string
  name: string
  size: number
  keccakBytes32: `0x${string}`
}

export async function uploadDisputeEvidenceFile(
  disputeId: string,
  file: File
): Promise<DisputeEvidenceUpload> {
  // Path: <dispute_id>/<basename>-<ts>-<rand>.<ext>. The leading UUID is what
  // the Storage RLS predicate keys on; strip separators/control chars from the
  // user-supplied name so it can't escape that prefix.
  const safeBase =
    (file.name || "evidence")
      // eslint-disable-next-line no-control-regex
      .replace(/[/\\\u0000-\u001f\u007f]/g, "_")
      .replace(/^\.+/, "")
      // Interior `..` would make the object name unusable by the cleanup
      // listing (it filters paths containing `..`) — collapse to a single dot.
      .replace(/\.{2,}/g, ".")
      .slice(0, 80) || "evidence"
  const ext = safeBase.includes(".")
    ? safeBase.slice(safeBase.lastIndexOf(".")).toLowerCase()
    : ""
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  // Never build a RegExp from the user-supplied extension (metacharacters).
  const stem = ext ? safeBase.slice(0, -ext.length) : safeBase
  const path = `${disputeId}/${stem}-${stamp}-${rand}${ext}`

  const bytes = new Uint8Array(await file.arrayBuffer())
  await ok(
    supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).upload(path, file, {
      upsert: false,
      cacheControl: "3600",
      contentType: file.type || undefined,
    }),
    "[uploadDisputeEvidenceFile] upload error"
  )

  // EVM keccak (viem), not SHA3; dynamic import keeps cold start cheap.
  const { keccak256 } = await import("viem")
  const keccakBytes32 = keccak256(bytes) as `0x${string}`
  return { path, name: file.name || path, size: bytes.byteLength, keccakBytes32 }
}

export async function getDisputeEvidenceSignedUrl(
  path: string,
  ttlSeconds: number = DISPUTE_EVIDENCE_SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(DISPUTE_EVIDENCE_BUCKET)
    .createSignedUrl(path, ttlSeconds)
  if (error || !data?.signedUrl) {
    console.error("[getDisputeEvidenceSignedUrl] sign failed:", error)
    return null
  }
  return data.signedUrl
}

export async function updateUserReputation(userId: string, delta: number) {
  await rpcCall(
    "increment_reputation_score",
    { user_id: userId, delta },
    "Error updating reputation"
  )
}

export async function getActiveOffers(
  limit = 50,
  offset = 0
): Promise<OfferWithSeller[]> {
  const { data, error } = await supabase.rpc("get_public_offers", {
    p_limit: limit,
    p_offset: offset,
  })
  if (error) fail("Error fetching offers", error)
  return (data ?? []) as unknown as OfferWithSeller[]
}

export async function getPublicOffersBySeller(
  publicHandle: string
): Promise<OfferWithSeller[]> {
  const data = await rpcCall(
    "get_public_offers_by_seller",
    { p_public_handle: publicHandle },
    "Error fetching seller offers"
  )
  return (data ?? []) as unknown as OfferWithSeller[]
}

function randomIdSuffix(): string {
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  let n = 0n
  for (const b of buf) n = (n << 8n) | BigInt(b)
  return n.toString(36).toUpperCase()
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${randomIdSuffix()}`.toUpperCase()
}

export async function getOfferById(
  id: string
): Promise<OfferWithSeller | null> {
  const { data, error } = await supabase.rpc("get_public_offer_by_id", {
    p_offer_id: id,
  })
  if (error) fail("Error fetching offer", error)
  return (data ?? null) as unknown as OfferWithSeller | null
}

export interface OfferTradeIntent {
  offer_id: string
  status: string
  type: "buy" | "sell"
  buyer_id: string
  seller_id: string
  buyer_wallet: string
  seller_wallet: string
  taker_role: "buyer" | "seller"
}

const TRADE_INTENT_ERRORS: readonly string[] = ["P0200", "P0201", "P0202"]

export async function getOfferTradeIntent(
  offerId: string
): Promise<OfferTradeIntent> {
  const { data, error } = await supabase.rpc("get_offer_trade_intent", {
    p_offer_id: offerId,
  })
  if (error) {
    const code = (error as { code?: string }).code
    if (typeof code === "string" && TRADE_INTENT_ERRORS.includes(code)) {
      throw Object.assign(new Error(`trade intent rejected (${code})`), {
        code,
      })
    }
    if (code === "P0002") {
      throw Object.assign(new Error("sign in required"), { code: "P0002" })
    }
    fail("Error resolving trade intent", error)
  }
  return data as OfferTradeIntent
}

export async function startOfferConversation(
  offerId: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("start_offer_conversation", {
    p_offer_id: offerId,
  })
  if (error) {
    const code = (error as { code?: string }).code
    if (code === "P0002") {
      throw Object.assign(new Error("unknown user"), { code: "P0002" })
    }
    fail("Error starting offer conversation", error)
  }
  return (data as string | null) ?? null
}

export async function createOffer(offerData: Partial<Offer>) {
  const { data, error } = await supabase
    .from("offers")
    .insert({
      ...offerData,
      offer_id: offerData.offer_id ?? generateId("OFF"),
      status: "active",
      published_at: new Date().toISOString(),
    })
    .select("id, offer_id")
    .single()
  if (error) fail("Error creating offer", error)
  return data
}

export async function updateOffer(id: string, patch: Partial<Offer>) {
  // RLS allows any anon UPDATE; callers must verify wallet ownership first.
  const sanitized: Record<string, unknown> = { ...patch }
  delete sanitized.id
  delete sanitized.offer_id
  delete sanitized.seller_id
  delete sanitized.status
  delete sanitized.published_at

  const { data, error } = await supabase
    .from("offers")
    .update({ ...sanitized, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, offer_id")
    .single()
  if (error) fail("Error updating offer", error)
  return data
}

export function generateDisputeId(): string {
  return generateId("DSP")
}

const TRADE_JOIN = `*, offer:offers(*), buyer:users!trades_buyer_id_fkey (wallet_address, nickname, avatar_url, verification_level), seller:users!trades_seller_id_fkey (wallet_address, nickname, avatar_url, verification_level)`

export async function getTradeById(id: string) {
  // Human-readable trade ids must hit the varchar column, not the uuid pk.
  const { data, error } = await supabase
    .from("trades")
    .select(TRADE_JOIN)
    .eq(isUuid(id) ? "id" : "trade_id", id)
    .single()
  if (error) {
    if (error.code === "PGRST116") return null
    fail("Error fetching trade by id", error)
  }
  return data
}

async function resolveTradeUuid(tradeId: string): Promise<string> {
  if (isUuid(tradeId)) return tradeId
  const trade = await getTradeById(tradeId)
  if (!trade) {
    throw new Error(
      `Cannot resolve trade "${tradeId}" to a uuid: no trade found. Pass the trade's uuid id instead.`
    )
  }
  return trade.id
}

export async function upsertTradeEscrowStatus(
  tradeId: string,
  escrowStatus: string,
  txHash?: string
) {
  // Direct escrow_status UPDATE is frozen by RLS; only the definer RPC writes.
  await rpcCall(
    "set_trade_escrow_status",
    {
      p_trade_id: tradeId,
      p_new_status: escrowStatus,
      p_tx_hash: txHash ?? null,
      p_event_type: "escrow_status_updated",
    },
    "Error updating trade escrow status"
  )
  // Re-read so callers get the persisted row; a read failure is a real error
  // (a silent null would look like "row missing").
  return one(
    supabase.from("trades").select().eq("id", tradeId).single(),
    "Error reloading trade after escrow status update",
    true
  )
}

export async function updateTradeStatus(
  tradeId: string,
  status: string,
  options?: {
    escrowStatus?: string
    txHash?: string
    escrowEventType?: TradeEventType
  }
) {
  // status/has_dispute/timestamps are revoked from `authenticated`; use the RPC.
  await rpcCall(
    "set_trade_status",
    {
      p_trade_id: tradeId,
      p_new_status: status,
      p_tx_hash: options?.txHash ?? null,
    },
    "Error updating trade status"
  )
  if (options?.escrowStatus) {
    await rpcCall(
      "set_trade_escrow_status",
      {
        p_trade_id: tradeId,
        p_new_status: options.escrowStatus,
        p_tx_hash: options?.txHash ?? null,
        p_event_type:
          options.escrowEventType ?? TradeEventType.ESCROW_STATUS_UPDATED,
      },
      "Error updating trade escrow status"
    )
  } else if (options?.escrowEventType) {
    await logTradeEvent(
      tradeId,
      options.escrowEventType,
      "system",
      `Trade status → ${status}`,
      { status, tx_hash: options.txHash ?? null }
    ).catch(() => {})
  }
  return one(
    supabase.from("trades").select().eq("id", tradeId).single(),
    "Error reloading trade after status update",
    true
  )
}

export async function setTradeEscrowStatus(
  tradeId: string,
  escrowStatus: EscrowStatus,
  options?: { txHash?: string; escrowEventType?: TradeEventType }
) {
  // Direct escrow_status UPDATE is frozen by RLS; only the definer RPC writes.
  await rpcCall(
    "set_trade_escrow_status",
    {
      p_trade_id: tradeId,
      p_new_status: escrowStatus,
      p_tx_hash: options?.txHash ?? null,
      p_event_type:
        options?.escrowEventType ?? TradeEventType.ESCROW_STATUS_UPDATED,
    },
    "Error setting trade escrow status"
  )
  return one(
    supabase.from("trades").select().eq("id", tradeId).single(),
    "Error reloading trade after setting escrow status",
    true
  )
}

export async function createTrade(input: CreateTradeInput) {
  const { data, error } = await supabase
    .from("trades")
    .insert({
      trade_id: generateId("TRD"),
      offer_id: input.offer_id,
      status: "active",
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
      escrow_contract_addr: input.escrow_contract_addr || null,
      escrow_status: EscrowStatus.AWAITING_DEPOSIT,
    })
    .select()
    .single()
  if (error) fail("Error creating trade", error)

  await logTradeEvent(
    data.id,
    "offer_accepted",
    input.taker_role,
    `Trade opened by ${input.taker_role}`,
    {
      escrow_address: input.escrow_contract_addr ?? null,
      creator: input.creator ?? null,
      kleros_court: input.kleros_court_addr ?? null,
    }
  )
  return data
}

export async function getTradesByUser(userId: string) {
  const { data, error } = await supabase
    .from("trades")
    .select(TRADE_JOIN)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("created_at", { ascending: false })
  if (error) fail("Error fetching user trades", error)
  return data
}

export async function getTradeByEscrowAddress(escrowAddress: string) {
  const data = await one(
    supabase
      .from("trades")
      .select("id, buyer_id, seller_id")
      .eq("escrow_contract_addr", escrowAddress)
      .maybeSingle(),
    "Error fetching trade by escrow"
  )
  return data as { id: string; buyer_id: string; seller_id: string } | null
}

async function logTradeEvent(
  tradeId: string,
  eventType: string,
  actor: string,
  description?: string,
  metadata?: Record<string, unknown>
) {
  await ok(
    supabase.from("trade_events").insert({
      trade_id: tradeId,
      type: eventType,
      actor,
      description: description || null,
      metadata: metadata || {},
    }),
    "Error logging trade event"
  )
}

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
    raiser?: "buyer" | "seller" | null
    feePaidWei?: string | null
    winner?: "buyer" | "seller" | null
    disputeTimestamp?: string | null
    rulingReceivedTime?: string | null
    klerosDisputeId?: string | null
    txHash?: string | null
    txHashEvidence?: string | null
    evidenceCid?: string | null
    description?: string | null
  }
) {
  const dbUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  // status/winner/on_chain_ruling/kleros_dispute_status/resolved_at are revoked
  // from `authenticated`; they go through the SECURITY DEFINER RPC instead.
  const sensitive: {
    p_status?: DisputeStatus
    p_winner?: "buyer" | "seller" | null
    p_on_chain_ruling?: number | null
    p_kleros_dispute_status?: number | null
    p_resolved_at?: string | null
    p_clear_resolved_at: boolean
  } = { p_clear_resolved_at: false }
  if (update.status !== undefined) sensitive.p_status = update.status
  if (update.winner !== undefined) sensitive.p_winner = update.winner
  if (update.onChainRuling !== undefined)
    sensitive.p_on_chain_ruling = update.onChainRuling
  if (update.klerosDisputeStatus !== undefined)
    sensitive.p_kleros_dispute_status = update.klerosDisputeStatus
  // resolvedAt is explicitly nullable: `!== undefined` preserves null resets.
  if (update.resolvedAt !== undefined) {
    sensitive.p_resolved_at = update.resolvedAt
    sensitive.p_clear_resolved_at = update.resolvedAt === null
  }

  const scalarMap = [
    ["escrowState", "escrow_state"],
    ["evidenceGroupId", "evidence_group_id"],
    ["appealCount", "appeal_count"],
    ["raiser", "raiser"],
    ["feePaidWei", "fee_paid_wei"],
    ["disputeTimestamp", "dispute_timestamp"],
    ["rulingReceivedTime", "ruling_received_time"],
    ["klerosDisputeId", "kleros_dispute_id"],
    ["txHash", "tx_hash"],
    ["txHashEvidence", "tx_hash_evidence"],
    ["evidenceCid", "evidence_cid"],
    ["description", "description"],
  ] as const
  for (const [key, col] of scalarMap) {
    const value = update[key]
    if (value !== undefined) dbUpdate[col] = value
  }

  const hasSensitive =
    sensitive.p_status !== undefined ||
    sensitive.p_winner !== undefined ||
    sensitive.p_on_chain_ruling !== undefined ||
    sensitive.p_kleros_dispute_status !== undefined ||
    sensitive.p_resolved_at !== undefined
  if (hasSensitive) {
    const { error: rpcErr } = await supabase.rpc("set_dispute_on_chain", {
      p_dispute_id: id,
      ...sensitive,
    })
    if (rpcErr) fail("Error setting dispute on-chain fields", rpcErr)
  }

  if (Object.keys(dbUpdate).length <= 1 && !hasSensitive) return null
  const { data, error: updateErr } = await supabase
    .from("disputes")
    .update(dbUpdate)
    .eq("id", id)
    .select()
    .single()
  if (updateErr) fail("Error updating dispute on-chain state", updateErr)
  return data
}

export async function createDispute(disputeData: Partial<Dispute>) {
  const { data, error } = await supabase
    .from("disputes")
    .insert({
      ...disputeData,
      status: disputeData.status ?? "open",
      created_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) fail("Error creating dispute", error)
  return data
}

export async function mirrorDisputeToTrade(
  tradeId: string,
  outcome: {
    tradeStatus: "completed" | "refunded" | "disputed"
    escrowStatus: EscrowStatus
    txHash: string
    escrowEventType: TradeEventType
  }
) {
  return updateTradeStatus(tradeId, outcome.tradeStatus, {
    escrowStatus: outcome.escrowStatus,
    txHash: outcome.txHash,
    escrowEventType: outcome.escrowEventType,
  })
}

export interface DisputeEvidenceFile {
  cid: string
  /** @deprecated minted on render via `getDisputeEvidenceSignedUrl(cid)`. */
  url?: string
  name?: string
  size?: number
  kind?: string
  keccakBytes32?: `0x${string}` | null
  txHash?: `0x${string}` | null
  evidenceGroupId?: number | null
}

export async function insertDisputeEvidence(
  disputeId: string,
  files: DisputeEvidenceFile[],
  submittedBy: "buyer" | "seller" | "neutral",
  evidenceGroupId: number | null = null
) {
  if (files.length === 0) return []
  if (!submittedBy) {
    throw new Error(
      "[insertDisputeEvidence] submittedBy is required — pass the filer role explicitly (B-4)."
    )
  }
  const now = new Date().toISOString()
  const rows = files.map((f) => ({
    dispute_id: disputeId,
    submitted_by: submittedBy,
    evidence_kind: f.kind ?? "image",
    ipfs_cid: f.cid,
    // Durable storage path (not an expiring signed URL).
    ipfs_url: f.cid,
    keccak_bytes32: f.keccakBytes32 ?? null,
    tx_hash: f.txHash ?? null,
    evidence_group_id: f.evidenceGroupId ?? evidenceGroupId ?? null,
    submitted_at: now,
  }))
  const { data, error } = await supabase
    .from("dispute_evidence")
    .insert(rows)
    .select()
  if (error) fail("Error inserting dispute evidence", error)
  return data ?? []
}

export async function getDisputesByTrade(tradeId: string) {
  const { data, error } = await supabase
    .from("disputes")
    .select("*")
    .eq("trade_id", tradeId)
  if (error) fail("Error fetching disputes", error)
  return data
}

export async function getDisputesByUser(userId: string) {
  const { data, error } = await supabase
    .from("disputes")
    .select(
      `*, trade:trades(trade_id, crypto_token, crypto_amount), buyer:users!disputes_buyer_id_fkey (nickname, avatar_url), seller:users!disputes_seller_id_fkey (nickname, avatar_url)`
    )
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("created_at", { ascending: false })
  if (error) fail("Error fetching user disputes", error)
  return data
}

export async function deleteDisputePlaceholder(id: string): Promise<void> {
  // Storage first: the bucket RLS predicate joins on the still-present
  // disputes.id for the caller's JWT. Then evidence rows, then the row itself.
  try {
    const { data: objects, error: listErr } = await supabase.storage
      .from(DISPUTE_EVIDENCE_BUCKET)
      .list(id, { limit: 1000 })
    if (listErr) {
      console.warn("[deleteDisputePlaceholder] storage list failed:", listErr)
    } else if (objects && objects.length > 0) {
      const paths = objects
        .map((o) => `${id}/${o.name}`)
        .filter((p) => !p.includes(".."))
      if (paths.length > 0) {
        const { error: removeErr } = await supabase.storage
          .from(DISPUTE_EVIDENCE_BUCKET)
          .remove(paths)
        if (removeErr) {
          console.warn(
            "[deleteDisputePlaceholder] storage remove failed:",
            removeErr
          )
        }
      }
    }
  } catch (err) {
    console.warn("[deleteDisputePlaceholder] storage list failed:", err)
  }
  // PostgREST returns (not throws) errors, so read `error` — a bare
  // try/catch around a builder never fires.
  const { error: evidenceErr } = await supabase
    .from("dispute_evidence")
    .delete()
    .eq("dispute_id", id)
  if (evidenceErr)
    console.warn("[deleteDisputePlaceholder] evidence delete failed:", evidenceErr)
  const { error } = await supabase.from("disputes").delete().eq("id", id)
  if (error) {
    console.warn("[deleteDisputePlaceholder] dispute delete failed:", error)
  }
}

export async function getDisputeById(id: string) {
  const { data, error } = await supabase
    .from("disputes")
    .select(
      `*,
      trade:trades(
        trade_id, crypto_token, crypto_amount, fiat_currency, fiat_amount,
        status, payment_method, escrow_status, escrow_contract_addr,
        buyer:users!trades_buyer_id_fkey (wallet_address, nickname, avatar_url),
        seller:users!trades_seller_id_fkey (wallet_address, nickname, avatar_url)
      ),
      buyer:users!disputes_buyer_id_fkey (wallet_address, nickname, avatar_url, verification_level),
      seller:users!disputes_seller_id_fkey (wallet_address, nickname, avatar_url, verification_level),
      evidence:dispute_evidence(*)`
    )
    .eq("id", id)
    .single()
  if (error) {
    if (error.code === "PGRST116") return null
    fail("Error fetching dispute", error)
  }
  return data
}

export async function submitTradeRating(ratingData: Partial<TradeRating>) {
  const payload: Partial<TradeRating> = { ...ratingData }

  if (payload.trade_id) {
    payload.trade_id = await resolveTradeUuid(payload.trade_id)
  }

  for (const field of ["rater_id", "rated_id"] as const) {
    const val = payload[field]
    if (val && !isUuid(val)) {
      const err = new Error(
        `Cannot submit rating: ${field} "${val}" is not a valid uuid.`
      )
      console.error("Error submitting rating:", err)
      throw err
    }
  }

  const { data, error } = await supabase
    .from("trade_ratings")
    .insert({ ...payload, submitted_at: new Date().toISOString() })
    .select()
    .single()
  if (error) {
    console.error("Error submitting rating:", error, "sent payload:", payload)
    throw error
  }
  return data
}

const RATING_JOIN = `*, rater:users!trade_ratings_rater_id_fkey (nickname, avatar_url), rated:users!trade_ratings_rated_id_fkey (nickname, avatar_url)`

export async function getRatingsForTrade(tradeId: string) {
  const { data, error } = await supabase
    .from("trade_ratings")
    .select(RATING_JOIN)
    .eq("trade_id", await resolveTradeUuid(tradeId))
    .order("submitted_at", { ascending: false })
  if (error) fail("Error fetching ratings", error)
  return data
}

export async function getRatingsByUser(userId: string) {
  const { data, error } = await supabase
    .from("trade_ratings")
    .select(
      `*, rater:users!trade_ratings_rater_id_fkey (nickname, avatar_url), trade:trades (trade_id, crypto_token, fiat_amount, fiat_currency)`
    )
    .eq("rated_id", userId)
    .order("submitted_at", { ascending: false })
  if (error) fail("Error fetching user ratings", error)
  return data
}

export async function getReputationScores(userId: string) {
  const { data, error } = await supabase
    .from("reputation_scores")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) fail("Error fetching reputation scores", error)
  return data
}

export async function hasUserRatedTrade(tradeId: string, userId: string) {
  const data = await one(
    supabase
      .from("trade_ratings")
      .select("id")
      .eq("trade_id", await resolveTradeUuid(tradeId))
      .eq("rater_id", userId)
      .maybeSingle(),
    "Error checking rating"
  )
  return !!data
}

export async function getRatedTradeIdsByUser(
  userId: string
): Promise<string[]> {
  const rows = await many<{ trade_id: string }>(
    supabase
      .from("trade_ratings")
      .select("trade_id")
      .eq("rater_id", userId),
    "Error listing rated trade ids"
  )
  return rows.map((r) => r.trade_id)
}

const USER_SELECT =
  "id, wallet_address, nickname, avatar_url, verification_level, last_active_at"
const CONV_TRADE_SELECT =
  "id, trade_id, status, escrow_status, escrow_contract_addr, crypto_token, crypto_amount, fiat_currency, fiat_amount"
const CONV_PARTICIPANTS_SELECT = `conversation_id, user_id, role, last_read_message_id, muted, joined_at, user:users!conversation_participants_user_id_fkey (${USER_SELECT})`
const CONV_SELECT = `*, trade:trades(${CONV_TRADE_SELECT}), participants:conversation_participants(${CONV_PARTICIPANTS_SELECT})`

export async function getConversationByTradeId(tradeId: string) {
  const data = await one(
    supabase
      .from("conversations")
      .select(CONV_SELECT)
      .eq("trade_id", tradeId)
      .single(),
    "Error fetching conversation by trade",
    true
  )
  return data as
    | (ConversationView & {
        participants: Array<ConversationWithParticipant>
      })
    | null
}

export async function listConversations(
  userId: string,
  options: { archived?: boolean } = {}
) {
  const { data: rows, error } = await supabase
    .from("conversation_participants")
    .select(
      `conversation_id, role, last_read_message_id, muted, conversation:conversations(id, trade_id, status, last_message_at, last_message_preview, created_at, updated_at, trade:trades(${CONV_TRADE_SELECT}), participants:conversation_participants(${CONV_PARTICIPANTS_SELECT}))`
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: false })
  if (error) fail("Error listing conversations", error)

  // One DB round-trip for all unread counts (vs per-conversation N+1).
  const unreadMap = new Map<string, number>()
  try {
    const { data: counts, error: countsErr } = await supabase.rpc(
      "get_unread_conversation_counts",
      { p_user_id: userId }
    )
    if (countsErr) throw countsErr
    for (const c of (counts ?? []) as Array<{
      conversation_id: string
      unread_count: number
    }>) {
      unreadMap.set(c.conversation_id, c.unread_count)
    }
  } catch (err) {
    console.warn(
      "[listConversations] unread count RPC failed, defaulting to 0:",
      err
    )
  }

  const out: ConversationView[] = []
  for (const row of (rows ?? []) as unknown as Array<{
    conversation: ConversationView | null
  }>) {
    const conv = row.conversation
    if (!conv) continue
    if (options.archived === true && conv.status !== "archived") continue
    if (options.archived === false && conv.status === "archived") continue
    const participants = (conv.participants ??
      []) as ConversationWithParticipant[]
    const me = participants.find((p) => p.user_id === userId)
    out.push({
      ...conv,
      participants,
      trade: conv.trade ?? null,
      unread_count: unreadMap.get(conv.id) ?? 0,
      last_read_message_id: me?.last_read_message_id ?? null,
    })
  }
  out.sort((a, b) => {
    const at = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
    const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
    return bt - at
  })
  return out
}

export async function getOrCreateDirectConversation(
  currentUserId: string,
  otherUserId: string
): Promise<string | null> {
  if (currentUserId === otherUserId) return null
  if (
    !UUID_STRICT_RE.test(currentUserId) ||
    !UUID_STRICT_RE.test(otherUserId)
  ) {
    return null
  }

  // Fast pre-check for the common existing-conversation case (avoids the RPC
  // round-trip + advisory lock); fall back to the race-safe RPC if none.
  const { data: myParts, error: partsErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", currentUserId)
  if (partsErr) fail("[getOrCreateDirectConversation] participant lookup", partsErr)
  const myConvIds = (myParts ?? []).map(
    (p: { conversation_id: string }) => p.conversation_id
  )
  if (myConvIds.length > 0) {
    const { data: shared, error: sharedErr } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", otherUserId)
      .in("conversation_id", myConvIds)
    if (sharedErr) fail("[getOrCreateDirectConversation] shared lookup", sharedErr)
    if (shared && shared.length > 0) {
      return shared[0].conversation_id as string
    }
  }

  const { data, error } = await supabase.rpc(
    "get_or_create_direct_conversation",
    {
      p_current_user_id: currentUserId,
      p_other_user_id: otherUserId,
    }
  )
  if (error) {
    const code = (error as { code?: string }).code
    if (code === "P0002") {
      throw Object.assign(new Error("unknown user"), { code: "P0002" })
    }
    fail("[getOrCreateDirectConversation] rpc", error)
  }
  return (data as string | null) ?? null
}

// Composite (created_at, id) cursor: a bare timestamp is lossy because
// timestamptz has ms resolution and siblings can tie.
async function getMessageSortKey(
  messageId: string
): Promise<{ created_at: string; id: string } | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("created_at")
    .eq("id", messageId)
    .single()
  if (error) {
    // Missing row (PGRST116) is expected; anything else hides a broken page.
    if (error.code !== "PGRST116")
      console.warn("[getMessageSortKey] cursor read failed:", error)
    return null
  }
  if (!data) return null
  return {
    created_at: (data as { created_at: string }).created_at,
    id: messageId,
  }
}

export async function getConversation(
  conversationId: string,
  userId: string
) {
  const data = await one(
    supabase
      .from("conversations")
      .select(CONV_SELECT)
      .eq("id", conversationId)
      .single(),
    "Error fetching conversation",
    true
  )
  if (!data) return null
  const conv = data as ConversationView
  const me = conv.participants.find((p) => p.user_id === userId)
  return { ...conv, last_read_message_id: me?.last_read_message_id ?? null }
}

export async function listMessages(
  conversationId: string,
  options: { limit?: number; before?: string } = {}
) {
  const limit = options.limit ?? 50

  // Deterministic (created_at, id) DESC ordering so same-ms ties never reorder.
  let query = supabase
    .from("messages")
    .select(
      `id, conversation_id, sender_id, body, kind, created_at, sender:users!messages_sender_id_fkey (${USER_SELECT})`
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit)

  if (options.before) {
    const cursor = await getMessageSortKey(options.before)
    if (!cursor) return []
    query = query.or(
      `and(created_at.lt.${cursor.created_at}),and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    )
  }

  const { data, error } = await query
  if (error) fail("Error listing messages", error)

  // FK guarantees one sender row; PostgREST still returns it as an array.
  const flat = (
    (data ?? []) as Array<
      Omit<MessageWithSender, "sender"> & {
        sender: MessageWithSender["sender"] | MessageWithSender["sender"][]
      }
    >
  ).map((row) => {
    const sender = Array.isArray(row.sender)
      ? (row.sender[0] ?? null)
      : (row.sender ?? null)
    return { ...row, sender } as MessageWithSender
  })
  return flat.reverse()
}

export async function sendMessage(input: {
  conversationId: string
  senderId: string
  body: string
  kind?: MessageKind
}) {
  const data = await one(
    supabase
      .from("messages")
      .insert({
        conversation_id: input.conversationId,
        sender_id: input.senderId,
        body: input.body.trim(),
        kind: input.kind ?? "text",
      })
      .select(
        `id, conversation_id, sender_id, body, kind, created_at, sender:users!messages_sender_id_fkey (${USER_SELECT})`
      )
      .single(),
    "Error sending message"
  )
  const raw = data as Omit<MessageWithSender, "sender"> & {
    sender: MessageWithSender["sender"] | MessageWithSender["sender"][]
  }
  const sender = Array.isArray(raw.sender)
    ? (raw.sender[0] ?? null)
    : (raw.sender ?? null)
  return { ...raw, sender }
}

export async function markConversationRead(input: {
  conversationId: string
  userId: string
  messageId: string
}) {
  await ok(
    supabase
      .from("conversation_participants")
      .update({ last_read_message_id: input.messageId })
      .eq("conversation_id", input.conversationId)
      .eq("user_id", input.userId),
    "Error marking conversation read"
  )
}

export async function setConversationViewing(input: {
  conversationId: string
  userId: string
  viewing: boolean
}): Promise<void> {
  // Best-effort: the trigger skips notifications while viewing_at is fresh.
  const { error } = await supabase
    .from("conversation_participants")
    .update({ viewing_at: input.viewing ? new Date().toISOString() : null })
    .eq("conversation_id", input.conversationId)
    .eq("user_id", input.userId)
  if (error) console.warn("[setConversationViewing] failed:", error)
}

export async function setConversationMuted(input: {
  conversationId: string
  userId: string
  muted: boolean
}): Promise<void> {
  await ok(
    supabase
      .from("conversation_participants")
      .update({ muted: input.muted })
      .eq("conversation_id", input.conversationId)
      .eq("user_id", input.userId),
    "Error muting conversation"
  )
}

export async function setConversationArchived(input: {
  conversationId: string
  archived: boolean
}): Promise<void> {
  let status = "archived"
  if (!input.archived) {
    // Preserve a locked thread: hardcoding "open" would re-enable sends. A
    // failed read must abort (not silently default to "open").
    const { data, error } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", input.conversationId)
      .maybeSingle()
    if (error) fail("[setConversationArchived] status read", error)
    status = data?.status === "locked" ? "locked" : "open"
  }
  await ok(
    supabase
      .from("conversations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", input.conversationId),
    "Error archiving conversation"
  )
}

export async function markConversationNotificationsRead(input: {
  conversationId: string
  userId: string
}): Promise<void> {
  await ok(
    supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", input.userId)
      .eq("conversation_id", input.conversationId)
      .is("read_at", null),
    "Error marking conversation notifications read"
  )
}

export async function listNotifications(userId: string, limit = 50) {
  return (await many(
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    "Error listing notifications"
  )) as Notification[]
}

export async function getUnreadNotificationCount(userId: string) {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)
  if (error) fail("Error counting notifications", error)
  return count ?? 0
}

export async function markNotificationRead(notificationId: string) {
  await ok(
    supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId),
    "Error marking notification read"
  )
}

export async function markAllNotificationsRead(userId: string) {
  await ok(
    supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null),
    "Error marking all notifications read"
  )
}

export async function getNotificationPreferences(userId: string) {
  return (await many(
    supabase.from("notification_preferences").select("*").eq("user_id", userId),
    "Error fetching notification preferences"
  )) as NotificationPreferences[]
}

export async function upsertNotificationPreference(input: {
  userId: string
  channel: NotificationChannel
  enabled: boolean
  emailAddress?: string | null
}) {
  await ok(
    supabase.from("notification_preferences").upsert(
      {
        user_id: input.userId,
        channel: input.channel,
        enabled: input.enabled,
        email_address: input.emailAddress ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,channel" }
    ),
    "Error upserting notification preference"
  )
}

export async function ensureDefaultNotificationPreferences(userId: string) {
  const rows: Array<{
    user_id: string
    channel: NotificationChannel
    enabled: boolean
  }> = [
    { user_id: userId, channel: "inapp", enabled: true },
    { user_id: userId, channel: "email", enabled: false },
  ]
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(rows, { onConflict: "user_id,channel", ignoreDuplicates: true })
  if (error) {
    console.error("Error ensuring default notification preferences:", error)
  }
}

export async function getOrCreateReferralCode(): Promise<string | null> {
  // Throw on failure so the "Get my link" button can surface an error instead
  // of silently no-op'ing.
  const data = await rpcCall<string | null>(
    "get_or_create_referral_code",
    {},
    "Error creating referral code"
  )
  return data ?? null
}

export async function claimReferral(
  code: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("claim_referral", { p_code: code })
  if (error) {
    console.warn("[claimReferral] rejected:", error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function getReferralDashboard(
  userId: string
): Promise<ReferralDashboard> {
  const [codeRes, relationsRes, eventsRes] = await Promise.all([
    supabase
      .from("referral_codes")
      .select("code")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("referral_relations")
      .select(
        `*, referred:users!referral_relations_referred_user_id_fkey (wallet_address, nickname, avatar_url)`
      )
      .eq("referrer_id", userId)
      .order("attributed_at", { ascending: false }),
    supabase
      .from("referral_fee_events")
      .select("*")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false }),
  ])

  // Surface read failures: silent [] / null would render an all-zero dashboard.
  if (codeRes.error) fail("Error fetching referral code", codeRes.error)
  if (relationsRes.error) fail("Error fetching referral relations", relationsRes.error)
  if (eventsRes.error) fail("Error fetching referral events", eventsRes.error)

  const relations: ReferralRelationWithUser[] = relationsRes.data ?? []
  const events: ReferralFeeEvent[] = eventsRes.data ?? []
  const totalEarned = events.reduce(
    (sum, e) => sum + (Number(e.earned_amount) || 0),
    0
  )
  const pendingEarned = events
    .filter((e) => e.status === "pending")
    .reduce((sum, e) => sum + (Number(e.earned_amount) || 0), 0)

  return {
    code: (codeRes.data?.code as string | undefined) ?? null,
    referred: relations,
    events,
    totalEarned,
    pendingEarned,
    paidEarned: totalEarned - pendingEarned,
  }
}

const SIWE_MARKER_KEY = "coffernode:siwe:last"
const siweDeclinedKey = (address: string) =>
  `coffernode:siwe:declined:${address}`

// SIWE: edge function issues a nonce, verifies the signature and mints a
// Supabase JWT (app_metadata.wallet_address is the RLS source of truth).
async function signInWithWallet(
  walletAddress: string,
  options: {
    signMessage: (args: { message: string }) => Promise<`0x${string}`>
    chainId?: number
    appName?: string
  }
): Promise<User | null> {
  const { signMessage, chainId, appName } = options
  const addr = walletAddress.toLowerCase() as `0x${string}`

  const { data: nonceRes, error: nonceErr } = await supabase.functions.invoke(
    "siwe-auth",
    { body: { action: "nonce", address: addr } }
  )
  if (nonceErr || !nonceRes?.nonce) {
    if (isEdgeFunctionRateLimited(nonceErr)) {
      throw new Error(
        "Too many sign-in attempts. Wait a few minutes and try again."
      )
    }
    throw nonceErr ?? new Error("no nonce")
  }
  const nonce = String(nonceRes.nonce)
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(nonce)) throw new Error("bad nonce")

  const { message, issuedAt } = buildSiweChallengeLocal(addr, {
    nonce,
    chainId,
    appName,
  })
  const signature = await signMessage({ message })

  const { data, error } = await supabase.functions.invoke("siwe-auth", {
    body: { action: "verify", message, signature },
  })
  if (error || !data?.access_token) {
    throw error ?? new Error("siwe-auth did not return a token")
  }

  // Use the real refresh token when present: a placeholder would break
  // autoRefreshToken, emit SIGNED_OUT and silently drop the session.
  const { error: sessionErr } = await supabase.auth.setSession({
    access_token: data.access_token as string,
    refresh_token:
      typeof data.refresh_token === "string" && data.refresh_token
        ? data.refresh_token
        : "siwe-wallet-session",
  })
  if (sessionErr) throw sessionErr

  setSiweMarker({ address: addr, issuedAt })

  // Device-bound identity derived from the signature; best-effort.
  try {
    await persistCofferIdentity(addr, signature)
  } catch (err) {
    console.warn("[coffer] failed to persist identity:", err)
  }
  return ensureUser(addr)
}

function setSiweMarker(marker: { address: string; issuedAt: string }): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SIWE_MARKER_KEY, JSON.stringify(marker))
  }
}

function isEdgeFunctionRateLimited(err: unknown): boolean {
  const ctx = (err as { context?: { status?: number } })?.context
  return ctx?.status === 429
}

export async function getSessionWallet(): Promise<string | null> {
  const session = await getSession()
  return session?.access_token
    ? walletClaimFromToken(session.access_token)
    : null
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".")
    if (!payload) return null
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    )
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

// app_metadata.wallet_address is the RLS source of truth. It MUST win over the
// legacy top-level claim: trusting the latter first could shadow the real claim.
function walletClaimFromToken(token: string): string | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  const appMeta = payload.app_metadata as Record<string, unknown> | undefined
  const raw =
    typeof appMeta?.wallet_address === "string"
      ? appMeta.wallet_address
      : typeof payload.wallet_address === "string"
        ? payload.wallet_address
        : null
  return typeof raw === "string" && raw ? raw.toLowerCase() : null
}

// Per-wallet "user declined" marker so a dismissed prompt is not retried on
// every mount; cleared on signOut / explicit retry.
function getSiweRejectedMarker(address: string): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(siweDeclinedKey(address)) === "1"
}

function setSiweRejectedMarker(address: string): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(siweDeclinedKey(address), "1")
}

function clearSiweRejectedMarker(address: string): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(siweDeclinedKey(address))
}

async function isSignedInAs(walletAddress: string): Promise<boolean> {
  const addr = walletAddress.toLowerCase()
  const session = await getSession()
  if (!session?.access_token) return false
  const payload = decodeJwtPayload(session.access_token)
  if (typeof payload?.exp === "number" && payload.exp * 1000 < Date.now())
    return false
  return (await getSessionWallet()) === addr
}

// Self-heal pre-backfill sessions: GoTrue re-issues tokens with the CURRENT
// app_metadata, so a stored refresh_token yields a wallet-claim JWT.
async function refreshToWalletClaim(address: string): Promise<boolean> {
  const addr = address.toLowerCase()
  const session = await getSession()
  if (!session?.access_token || !session.refresh_token) return false

  const payload = decodeJwtPayload(session.access_token)
  const notExpired =
    typeof payload?.exp !== "number" || payload.exp * 1000 > Date.now()
  if (walletClaimFromToken(session.access_token) === addr && notExpired)
    return true

  const { data, error } = await supabase.auth.refreshSession()
  if (error) return false
  const accessToken = data?.session?.access_token
  if (!accessToken) return false
  return walletClaimFromToken(accessToken) === addr
}

export async function recoverWalletSession(
  walletAddress: string
): Promise<boolean> {
  const addr = walletAddress.toLowerCase()
  if (await isSignedInAs(addr)) return true
  if (await refreshToWalletClaim(addr)) return true
  return false
}

export async function ensureWalletSession(
  walletAddress: string,
  options: {
    signMessage: (args: { message: string }) => Promise<`0x${string}`>
    chainId?: number
    appName?: string
    /** Explicit intent (navbar "Sign in"): bypass the persisted rejection. */
    force?: boolean
  }
): Promise<{ session: boolean; user: User | null }> {
  const addr = walletAddress.toLowerCase()

  if (await refreshToWalletClaim(addr)) {
    return { session: true, user: await ensureUser(addr) }
  }
  if (await isSignedInAs(addr)) {
    return { session: true, user: await ensureUser(addr) }
  }
  if (!options.force && getSiweRejectedMarker(addr)) {
    return { session: false, user: await ensureUser(addr) }
  }

  try {
    await signInWithWallet(addr, options)
    clearSiweRejectedMarker(addr)
    return { session: true, user: await ensureUser(addr) }
  } catch (err) {
    // Any failure marks a soft decline — don't re-prompt on every mount.
    setSiweRejectedMarker(addr)
    if (isEdgeFunctionRateLimited(err)) {
      console.warn(
        "[ensureWalletSession] sign-in rate-limited:",
        err instanceof Error ? err.message : err
      )
    } else {
      console.error("[ensureWalletSession] sign-in failed:", err)
    }
    return { session: false, user: null }
  }
}

// Inlined copy of lib/siwe's challenge builder to keep this module importable
// without a circular dep through @/lib/notifications.
function buildSiweChallengeLocal(
  address: `0x${string}`,
  options: { chainId?: number; appName?: string; nonce?: string } = {}
): { nonce: string; message: string; issuedAt: string } {
  const issuedAt = new Date().toISOString()
  const nonce = options.nonce ?? localNonce()
  // Must equal the URI host below: `parseSiweMessage` (siwe-auth) derives the
  // header domain and rejects unless it is allowlisted AND equals `uriHost`.
  const appName = options.appName ?? "coffernode.app"
  const chainLine =
    options.chainId != null ? `\nChain ID: ${options.chainId}` : ""
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

function localNonce(bytes = 16): string {
  const arr = new Uint8Array(bytes)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < arr.length; i++)
      arr[i] = Math.floor(Math.random() * 256)
  }
  let bin = ""
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function clearSiweMarkersFor(address: string): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(SIWE_MARKER_KEY)
  clearSiweRejectedMarker(address)
}

export async function signOut() {
  clearAllUserCache()
  // Clear only the active wallet's markers — never sweep other wallets'
  // rejection flags, which would re-enable auto-prompting for them.
  if (typeof window !== "undefined") {
    const last = window.localStorage.getItem(SIWE_MARKER_KEY)
    if (last) {
      try {
        const parsed = JSON.parse(last) as { address?: string }
        if (parsed.address) clearSiweMarkersFor(parsed.address.toLowerCase())
        else window.localStorage.removeItem(SIWE_MARKER_KEY)
      } catch {
        window.localStorage.removeItem(SIWE_MARKER_KEY)
      }
    }
  }
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error("Error signing out:", error)
    throw error
  }
}

async function getSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error) console.warn("[getSession] session read failed:", error)
  return session
}
