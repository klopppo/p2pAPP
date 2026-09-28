// Session mirror cookie — the only client → edge identity bridge. The SPA keeps
// the Supabase session in localStorage, so `coffernode_session` mirrors the
// *public* wallet address into an HTTP cookie the edge reads for per-route
// cache keys. It is NOT a credential: it grants no session access (RLS
// authorizes via the JWT) and the address is already public on the profile
// page. `SameSite=Lax` + `Secure` on https + `Path=/`; the edge only stores a
// hash of it as the cache key.

export const SESSION_COOKIE_NAME = 'coffernode_session'
const SESSION_COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60
const WALLET_RE = /^0x[0-9a-f]{40}$/

/** Write the cookie for a live session, or expire it with `null`. */
export function writeSessionCookie(walletAddress: string | null): void {
  if (typeof document === 'undefined') return
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  // Expire in place: always Path=/ + Max-Age=0 so a different path can't keep a
  // stale mirror alive.
  const value =
    walletAddress && WALLET_RE.test(walletAddress.toLowerCase())
      ? `${encodeURIComponent(walletAddress.toLowerCase())}; Max-Age=${SESSION_COOKIE_MAX_AGE_S}`
      : '; Max-Age=0'
  document.cookie = `${SESSION_COOKIE_NAME}=${value}; Path=/${secure}; SameSite=Lax`
}
