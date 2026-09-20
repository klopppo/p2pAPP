// Session mirror cookie — the only client → edge identity bridge.
//
// The SPA keeps the Supabase session in localStorage (persistSession), so the
// edge never sees an auth cookie on document requests. `coffernode_session`
// mirrors the *public* identity (the connected wallet address) into an HTTP
// cookie the edge middleware can read to derive a per-route cache key.
//
// Security posture (why this is safe to set from JS):
//  - The value is the lowercased wallet address, which is ALREADY public on
//    the user's own `/app/profile/<wallet>` page. It is NOT the Supabase
//    access/refresh token — never put tokens in a JS-readable cookie.
//  - XSS exposure cost = leaking a public string; it grants no session access
//    (RLS authorizes via the supabase JWT, not this cookie).
//  - `SameSite=Lax` blocks cross-site inclusion; `Secure` on https only;
//    `Path=/` makes it visible to every route exactly as the middleware needs.
//  - The edge derives only a *hash* of this value for the cache key, so the
//    CDN layer never stores recognizable identities (see functions/_lib/cache-key.ts).

export const SESSION_COOKIE_NAME = 'coffernode_session'
/** 7 days — long enough to survive a tab close, short enough to self-heal
 *  stale mirrors (the hook re-syncs on every auth change anyway). */
export const SESSION_COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60

/** Wallet addresses rendered on public profiles; the only accepted shape. */
const WALLET_RE = /^0x[0-9a-f]{40}$/

/**
 * Write (or clear) the session mirror cookie.
 *
 * Pass the lowercased wallet address when a live session exists, `null` to
 * expire the cookie immediately (sign-out / no session).
 */
export function writeSessionCookie(walletAddress: string | null): void {
  if (typeof document === 'undefined') return
  const https = typeof location !== 'undefined' && location.protocol === 'https:'
  const secure = https ? '; Secure' : ''
  const base = `${SESSION_COOKIE_NAME}=`
  // Expire in place when the wallet went away — clearing cookies from a
  // *different* path is a silent-footgun, so always set Path=/ and Max-Age=0.
  const value = walletAddress && WALLET_RE.test(walletAddress.toLowerCase())
    ? `${encodeURIComponent(walletAddress.toLowerCase())}; Max-Age=${SESSION_COOKIE_MAX_AGE_S}`
    : '; Max-Age=0'
  document.cookie = `${base}${value}; Path=/${secure}; SameSite=Lax`
}

/** Read the current mirror cookie value (lowercased wallet, or null). */
export function readSessionCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`),
  )
  if (!match || !match[1]) return null
  try {
    const raw = decodeURIComponent(match[1]).toLowerCase()
    return WALLET_RE.test(raw) ? raw : null
  } catch {
    return null
  }
}