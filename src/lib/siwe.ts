/**
 * Sign-In with Ethereum (SIWE) helper. Replaces the legacy magic-link OTP
 * flow (`signInWithOtp({ email: 0xabc...@wallet.p2p })`) which was both
 * slow (required an email round-trip) and fragile (no real email server
 * is configured for the wallet.* domain).
 *
 * Flow:
 *   1. Client generates a 16-byte hex nonce and a human-readable message.
 *   2. Wallet signs the message with `personal_sign` (the same flow used
 *      everywhere in the Web3 ecosystem). EIP-191 prefixed automatically.
 *   3. Client verifies the signature against the recovered address with
 *      viem's `verifyMessage`. This is the same algorithm an edge function
 *      would run, but done locally so no server round-trip is needed and
 *      the user gets instant feedback.
 *   4. On success we call `ensureUser(address)` which idempotently inserts
 *      / updates the `users` row keyed by `lower(wallet_address)`.
 *
 * The frontend doesn't gate any other flow on this — Supabase RLS is
 * permissive during dev (see §17 of the project docs). When SIWE backend
 * signing lands the flow will mint a Supabase JWT and the RLS policies
 * will tighten to `auth.jwt() ->> 'wallet_address' = wallet_address`.
 *
 * Why client-side verify is acceptable here:
 *   • It's only used to gate `ensureUser()` (creating the user row).
 *   • The wallet is what the user controls; if the signature was made by
 *     a different key, `verifyMessage` returns false and we reject.
 *   • No funds move on this path; the on-chain escrow is bound to the
 *     address itself, not the Supabase user row.
 */
import { verifyMessage } from 'viem'

export interface SiweNonceOptions {
  /** Number of bytes; default 16 (32 hex chars). */
  bytes?: number
}

const NONCE_RE =
  /^[a-zA-Z0-9_-]{8,64}$/

/**
 * Generate a fresh nonce suitable for an SIWE message. Returns both the
 * raw nonce and the full SIWE-shaped message so callers can display the
 * exact copy the wallet will sign (UX nicety).
 */
export function buildSiweChallenge(
  address: `0x${string}`,
  options: SiweNonceOptions & {
    chainId?: number
    appName?: string
  } = {},
): { nonce: string; message: string; issuedAt: string } {
  const issuedAt = new Date().toISOString()
  const nonce = generateNonce(options.bytes ?? 16)
  const appName = options.appName ?? 'CofferNode'
  const chainLine =
    options.chainId != null ? `\nChain ID: ${options.chainId}` : ''
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
 * Cryptographically random, URL-safe nonce. Default 16 bytes ≈ 22 base64
 * chars (well below the 64-char cap the EIP-4361 spec recommends).
 */
export function generateNonce(bytes = 16): string {
  const arr = new Uint8Array(bytes)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr)
  } else if (typeof globalThis.crypto !== 'undefined') {
    globalThis.crypto.getRandomValues(arr)
  } else {
    // Last-resort fallback for SSR / non-secure contexts. NOT cryptographically
    // strong but better than throwing.
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  // base64url (A-Z a-z 0-9 - _) without padding so the user sees a tidy
  // string in the wallet popup.
  let bin = ''
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  if (typeof btoa !== 'undefined') {
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  // Node fallback (tests).
  return Buffer.from(arr).toString('base64url')
}

/**
 * Verify a `personal_sign` response by recovering the signer address and
 * comparing against `expectedAddress`. Returns true iff the signature was
 * produced by the wallet holding `expectedAddress`.
 *
 * Done client-side (no server round-trip) because the only consumer is
 * `signInWithWallet`, which precedes an `ensureUser()` write to our own
 * Supabase — the wallet is the user-controlled secret so a client-side
 * check is sufficient. (Server-side verification becomes relevant when
 * SIWE issues a Supabase JWT — see TODO §6.20.)
 */
export async function verifySiwe(
  message: string,
  signature: `0x${string}`,
  expectedAddress: `0x${string}`,
): Promise<{ ok: boolean; recovered?: `0x${string}` | undefined }> {
  const ok = await verifyMessage({
    address: expectedAddress,
    message,
    signature,
  })
  if (ok) return { ok: true }
  // Defense-in-depth: even if verifyMessage returns false (e.g. wallet
  // returned an EIP-1271 signature), double-check the recovered signer.
  const recovered = await recoverMessageAddress({ message, signature })
  return {
    ok: recovered?.toLowerCase() === expectedAddress.toLowerCase(),
    recovered: recovered ?? undefined,
  }
}

async function recoverMessageAddress(args: {
  message: string
  signature: `0x${string}`
}): Promise<`0x${string}` | undefined> {
  try {
    const { recoverMessageAddress: recover } = await import('viem')
    return recover(args)
  } catch {
    return undefined
  }
}

/**
 * Throw a typed error string callers can detect by message-substring.
 * Lets catch-blocks show `t('errors.siweRejected')` instead of a generic
 * "verification failed" wall.
 */
export class SiweRejectedError extends Error {
  override name = 'SiweRejectedError'
}

/**
 * Validate a generated nonce is well-formed before sending it through. Pure
 * helper, exported for tests.
 */
export function isValidNonce(n: string): boolean {
  return NONCE_RE.test(n)
}
