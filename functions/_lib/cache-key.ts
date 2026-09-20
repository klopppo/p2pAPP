// Per-route cache-key derivation from the request HTTP cookies.
//
// Every document navigation on the deployed site goes through
// `functions/_middleware.ts`; that middleware stamps the key computed here on
// EVERY route (public and private) via the `x-cache-key` response header, and
// public routes additionally declare `Vary: Cookie` so the CDN actually stores
// per-cookie variants instead of one shared entry.
//
// Security properties:
//  - The only cookie consulted is `coffernode_session`, a client-mirrored
//    copy of the *public* wallet identity (see src/lib/sessionCookie.ts). No
//    token ever leaves the server and none is needed here.
//  - Malformed / missing / non-evm cookies collapse to the shared `anon`
//    identity — a garbage value can never mint its own cache slot.
//  - The cache key embeds only a 16-hex SHA-256 prefix of the identity, so
//    identities are never stored in the CDN layer in recognizable form.
//  - The key is route-scoped: two pathnames never share a slot, which holds
//    even when the identities collide.

export const SESSION_COOKIE_NAME = 'coffernode_session'
export const ANON_IDENTITY = 'anon'

/** Lowercased 0x-address — the same shape accepted by readSessionCookie. */
const WALLET_RE = /^0x[0-9a-f]{40}$/

/** Minimal cookie-header splitter. Spec-tolerant, defensive by design. */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!name || value === '') continue
    out[name] = value
  }
  return out
}

/**
 * Resolve the request's cache identity from its Cookie header.
 *
 * Returns the lowercased wallet address when the mirror cookie is present and
 * well-formed, otherwise `anon`. Never throws — caller-facing parsing issues
 * (bad percent-encoding, junk values) degrade to the anonymous slot.
 */
export function cookieIdentity(cookieHeader: string | null): string {
  const value = parseCookies(cookieHeader)[SESSION_COOKIE_NAME]
  if (!value) return ANON_IDENTITY
  let raw: string
  try {
    raw = decodeURIComponent(value).toLowerCase()
  } catch {
    return ANON_IDENTITY
  }
  return WALLET_RE.test(raw) ? raw : ANON_IDENTITY
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Deterministic, route-scoped cache key for a document request.
 *
 * `ck:v1:<pathname>:<sha256(identity) | 0..16>` — same input, same key;
 * different route or different session → different key.
 */
export async function routeCacheKey(
  pathname: string,
  cookieHeader: string | null,
): Promise<string> {
  const identity = cookieIdentity(cookieHeader)
  const short = (await sha256Hex(identity)).slice(0, 16)
  return `ck:v1:${pathname}:${short}`
}