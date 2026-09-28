/**
 * Coffer Identity vault — device-bound, pseudonymous trading identity.
 *
 *   master = HKDF(signature, salt = DOMAIN, info = "master")   ← client-only
 *   key_x  = HKDF(master, info = "epoch:x")                    ← client-only
 *   pseudonym(label) = "CN-" + sha256(key_label)[0..16]
 *
 * The ECDSA `personal_sign` signature is deterministic (RFC 6979), so the
 * master is stable across logins without the server ever seeing it; it stays
 * on-device. It can NOT spend funds or recover wallet keys. Bumping the epoch
 * re-derives every label; burning deletes the local vault.
 */
import { hkdfSha256, sha256Hex, bytesToHex, hexToBytes } from "@/lib/crypt"

const COFFER_DOMAIN = "coffernode:coffer:v1"
const STORAGE_KEY = "coffernode:coffer:identity:v1"
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
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return null
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

/** Derive the identity master from the SIWE signature (deterministic). */
export async function deriveMasterSecret(signature: `0x${string}`): Promise<string> {
  const key = await hkdfSha256({
    ikm: hexToBytes(signature),
    salt: COFFER_DOMAIN,
    info: MASTER_INFO,
    length: 32,
  })
  return bytesToHex(key)
}

/** Build an in-memory identity (pure). Commit it with `persistCofferIdentity`. */
export function buildCofferIdentity(address: string, masterHex: string, epoch = 0): CofferIdentity {
  return {
    address: address.toLowerCase(),
    masterHex,
    epoch,
    createdAt: new Date().toISOString(),
  }
}

/** Create the vault for `address` from its SIWE signature and persist it. */
export async function persistCofferIdentity(
  address: string,
  signature: `0x${string}`,
  storage: CofferStorage | null = localStorageBackedStorage(),
): Promise<CofferIdentity | null> {
  const identity = buildCofferIdentity(address, await deriveMasterSecret(signature))
  cachedIdentity = identity
  storage?.set(identity)
  return identity
}

/** Load the vault stored on this device for the connected wallet. */
export function loadCofferIdentity(
  storage: CofferStorage | null = localStorageBackedStorage(),
): CofferIdentity | null {
  if (cachedIdentity) return cachedIdentity
  cachedIdentity = storage?.get() ?? null
  return cachedIdentity
}

/** Expand a per-label key from the master (client-only, deterministic). */
async function deriveCofferKey(identity: CofferIdentity, label: string): Promise<string> {
  const key = await hkdfSha256({
    ikm: hexToBytes(identity.masterHex),
    salt: COFFER_DOMAIN,
    info: `${identity.epoch}:${label}`,
    length: 32,
  })
  return bytesToHex(key)
}

/**
 * Opaque, deterministic pseudonym for a label (trade id, conversation id, …).
 * Same label + identity → same pseudonym; different epochs → all change.
 */
export async function cofferPseudonym(identity: CofferIdentity, label: string): Promise<string> {
  const digest = await sha256Hex(hexToBytes(await deriveCofferKey(identity, label)))
  return `${PSEUDONYM_PREFIX}${digest.slice(0, PSEUDONYM_HEX_CHARS).toUpperCase()}`
}

/** Per-trade pseudonym — offers embed this, not the wallet. */
export async function tradePseudonym(identity: CofferIdentity, tradeId: string): Promise<string> {
  return cofferPseudonym(identity, `trade:${tradeId}`)
}

/** Per-conversation pseudonym for chat. */
export async function conversationPseudonym(
  identity: CofferIdentity,
  conversationId: string,
): Promise<string> {
  return cofferPseudonym(identity, `conversation:${conversationId}`)
}

/** Stable identity fingerprint for the profile card (not wallet-correlatable). */
export async function profileFingerprint(identity: CofferIdentity): Promise<string> {
  return cofferPseudonym(identity, "self")
}

/** Pure rotation — commit with `saveRotatedIdentity`. */
export function rotateIdentity(identity: CofferIdentity): CofferIdentity {
  return { ...identity, epoch: identity.epoch + 1 }
}

export function saveRotatedIdentity(
  rotated: CofferIdentity,
  storage: CofferStorage | null = localStorageBackedStorage(),
): CofferIdentity {
  cachedIdentity = rotated
  storage?.set(rotated)
  return rotated
}

/** Delete the vault from this device. Funds are unaffected. */
export function burnCofferIdentity(
  storage: CofferStorage | null = localStorageBackedStorage(),
): void {
  cachedIdentity = null
  storage?.remove()
}
