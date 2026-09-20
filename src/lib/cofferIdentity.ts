/**
 * Coffer Identity vault — device-bound, pseudonymous trading identity.
 *
 * Threat model: the *counterparty* must not be able to correlate our trade /
 * conversation activity back to our on-chain wallet, while the operator can
 * still read data (anti-fraud / dispute resolution). We do NOT fight the
 * operator here — server-side pseudonyms would just be a mapping the operator
 * can invert, so instead:
 *
 *   master = HKDF(signature, salt = DOMAIN, info = "master")   ← client-only
 *   key_x  = HKDF(master, info = "x")                          ← client-only
 *   pseudonym(label) = "CN-" + sha256(key_label)[0..8 bytes]
 *
 * The ECDSA `personal_sign` signature is *deterministic* (RFC 6979): the same
 * wallet signing the same EIP-4361 message always yields the same bytes, so
 * the master is stable across logins WITHOUT the server ever seeing it. It is
 * stored only on this device and never leaves it.
 *
 * The master can NOT spend funds and can NOT recover wallet keys — worst case
 * on theft is that an attacker re-derives our app-layer pseudonyms.
 *
 * Rotation: bumping the epoch re-derives every label → all pseudonyms change.
 * Burn: deletes the local vault → this device's pseudonym history is gone.
 */

import { hkdfSha256, sha256Hex, bytesToHex, hexToBytes } from "@/lib/crypt"

export const COFFER_DOMAIN = "coffernode:coffer:v1"
export const STORAGE_KEY = "coffernode:coffer:identity:v1"
export const PSEUDONYM_PREFIX = "CN-"
export const PSEUDONYM_HEX_CHARS = 16

const MASTER_INFO = "CofferNode identity master"

export interface CofferIdentity {
  /** Lowercased wallet address this identity was derived from. */
  address: string
  /** HKDF master secret derived from the SIWE signature (hex, 32 bytes). */
  masterHex: string
  /** Bumped on rotation — every pseudonym changes. */
  epoch: number
  createdAt: string
}

export interface CofferStorage {
  get(): CofferIdentity | null
  set(identity: CofferIdentity): void
  remove(): void
}

function localStorageBackedStorage(): CofferStorage | null {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage === "undefined"
  ) {
    return null
  }
  return {
    get() {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw) as CofferIdentity
        if (typeof parsed.masterHex !== "string" || !parsed.address) return null
        return parsed
      } catch {
        return null
      }
    },
    set(identity) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
    },
    remove() {
      window.localStorage.removeItem(STORAGE_KEY)
    },
  }
}

let cachedIdentity: CofferIdentity | null = null

/**
 * Derive the identity master from the SIWE signature bytes.
 * Deterministic per (wallet + message): same signature → same master.
 */
export async function deriveMasterSecret(
  signature: `0x${string}`
): Promise<string> {
  const ikm = hexToBytes(signature)
  const key = await hkdfSha256({
    ikm,
    salt: COFFER_DOMAIN,
    info: MASTER_INFO,
    length: 32,
  })
  return bytesToHex(key)
}

/**
 * Build an in-memory identity object (pure). Use `persistCofferIdentity` to
 * commit it to device storage.
 */
export function buildCofferIdentity(
  address: string,
  masterHex: string,
  epoch = 0
): CofferIdentity {
  return {
    address: address.toLowerCase(),
    masterHex,
    epoch,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Create the vault for `address` from its SIWE signature and persist it.
 * Non-fatal for the caller: identity is best-effort, never blocks sign-in.
 */
export async function persistCofferIdentity(
  address: string,
  signature: `0x${string}`,
  storage: CofferStorage | null = localStorageBackedStorage()
): Promise<CofferIdentity | null> {
  const masterHex = await deriveMasterSecret(signature)
  const identity = buildCofferIdentity(address, masterHex)
  cachedIdentity = identity
  storage?.set(identity)
  return identity
}

/** Load the vault stored on this device for the connected wallet. */
export function loadCofferIdentity(
  storage: CofferStorage | null = localStorageBackedStorage()
): CofferIdentity | null {
  if (cachedIdentity) return cachedIdentity
  cachedIdentity = storage?.get() ?? null
  return cachedIdentity
}

export function hasCofferIdentity(): boolean {
  return loadCofferIdentity() !== null
}

/** Expand a per-label key from the master (client-only, deterministic). */
export async function deriveCofferKey(
  identity: CofferIdentity,
  label: string
): Promise<string> {
  const key = await hkdfSha256({
    ikm: hexToBytes(identity.masterHex),
    salt: COFFER_DOMAIN,
    info: `${identity.epoch}:${label}`,
    length: 32,
  })
  return bytesToHex(key)
}

/**
 * An opaque, deterministic pseudonym for a label (trade id, conversation id,
 * …). Same label + same identity → same pseudonym; different epochs → all
 * pseudonyms change.
 */
export async function cofferPseudonym(
  identity: CofferIdentity,
  label: string
): Promise<string> {
  const key = await deriveCofferKey(identity, label)
  const digest = await sha256Hex(hexToBytes(key))
  return `${PSEUDONYM_PREFIX}${digest
    .slice(0, PSEUDONYM_HEX_CHARS)
    .toUpperCase()}`
}

/** Per-trade pseudonym — addresses/offers embed this, not the wallet. */
export async function tradePseudonym(
  identity: CofferIdentity,
  tradeId: string
): Promise<string> {
  return cofferPseudonym(identity, `trade:${tradeId}`)
}

/** Per-conversation pseudonym for chat. */
export async function conversationPseudonym(
  identity: CofferIdentity,
  conversationId: string
): Promise<string> {
  return cofferPseudonym(identity, `conversation:${conversationId}`)
}

/** Stable identity fingerprint — shown in the profile card, not correlatable
 *  back to the wallet by a counterparty. */
export async function profileFingerprint(
  identity: CofferIdentity
): Promise<string> {
  return cofferPseudonym(identity, "self")
}

/** Pure rotation — returns a NEW identity with a bumped epoch. Commit it with
 *  `saveRotatedIdentity`. */
export function rotateIdentity(identity: CofferIdentity): CofferIdentity {
  return {
    ...identity,
    epoch: identity.epoch + 1,
  }
}

export function saveRotatedIdentity(
  rotated: CofferIdentity,
  storage: CofferStorage | null = localStorageBackedStorage()
): CofferIdentity {
  cachedIdentity = rotated
  storage?.set(rotated)
  return rotated
}

/** Delete the vault from this device. Funds are unaffected. */
export function burnCofferIdentity(
  storage: CofferStorage | null = localStorageBackedStorage()
): void {
  cachedIdentity = null
  storage?.remove()
}
