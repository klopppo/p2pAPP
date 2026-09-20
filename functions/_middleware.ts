// Edge document layer — the "per-route" brain behind Fase 2 (OD-03).
//
// Every document navigation on the deployed site goes through this
// middleware (see public/_routes.json). It decides, per route:
//
//   - PUBLIC  (landing, docs, marketplace, offer detail, public profile)
//     → serve the built SPA shell with public data injected as
//       <script id="__EDGE_DATA__" type="application/json"> and an
//       edge-cacheable Cache-Control (s-maxage + SWR). The client reads the
//       blob in src/lib/edgeData.ts and hydrates react-query BEFORE first
//       render → deep links paint instantly, no skeleton flash.
//
//   - PRIVATE (all /app routes carrying user data: trades, messages,
//     disputes, operator, edit pages) → `Cache-Control: no-store`, no data
//     ever leaves the edge for them; the SPA shell gates on the session.
//
// Non-document requests (assets, API calls) pass straight through.
//
// Cookie-derived cache keys (see ./_lib/cache-key.ts): every document
// response carries `x-cache-key: ck:v1:<route>:<sha256-ish of the request
// cookie identity>`, so each route is stamped with a key bound to the
// requester's session cookie. Public routes additionally declare
// `Vary: Cookie` so the CDN stores per-cookie variants instead of one shared
// entry; private routes stay `no-store` (user data never cached) and only
// expose the key for observability/purge tooling.

import { collectPublicData } from './_lib/public-data'
import { routeCacheKey } from './_lib/cache-key'
import type { EdgeEnv, PublicData } from './_lib/public-data'

const SPA_SHELL = '/index.html'
const EDGE_DATA_ID = '__EDGE_DATA__'

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: data: blob:",
  'frame-src https:',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ')

// Exact + prefix matches. Detail routes intentionally exclude `/edit` and any
// deeper nesting (regex anchored at the last path segment).
function isPublicRoute(pathname: string): boolean {
  if (pathname === '/' || pathname === '/app/offers' || pathname === '/app/profile') {
    return true
  }
  if (pathname.startsWith('/docs')) return true
  if (/^\/app\/offer\/[^/]+$/.test(pathname)) return true
  if (/^\/app\/profile\/[^/]+$/.test(pathname)) return true
  return false
}

function isDocumentRequest(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('text/html')
}

function isAssetRequest(pathname: string): boolean {
  return (
    /^\/assets\//.test(pathname) ||
    /\.(?:js|css|map|woff2?|png|svg|ico|webp|json|txt|xml)$/.test(pathname)
  )
}

function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Content-Security-Policy': CSP,
  }
}

function injectEdgeData(
  html: string,
  payload: { pathname: string; publicData: PublicData },
): string {
  const json = JSON.stringify(payload).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return html.replace(
    '</head>',
    `<script id="${EDGE_DATA_ID}" type="application/json">${json}</script></head>`,
  )
}

export const onRequest = async ({
  request,
  env,
  next,
}: {
  request: Request
  env: EdgeEnv
  next: () => Promise<Response>
}): Promise<Response> => {
  const url = new URL(request.url)
  const { pathname } = url

  if (isAssetRequest(pathname)) return next()

  if (isDocumentRequest(request)) {
    const shell = await env.ASSETS.fetch(new URL(SPA_SHELL, url.origin))
    let html = await shell.text()

    const isPublic = isPublicRoute(pathname)
    // `?edge-data=0` opt-out console for debugging (e.g. compare cached shell).
    if (isPublic && !url.searchParams.has('edge-data')) {
      const publicData = await collectPublicData(env, pathname)
      html = injectEdgeData(html, { pathname, publicData })
    }

    // Cookie-derived cache key — stamped on EVERY route (public or private)
    // so each page advertises the exact key its cached entry lives under.
    const cacheKey = await routeCacheKey(pathname, request.headers.get('cookie'))

    return new Response(html, {
      status: shell.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': isPublic
          ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=300'
          : 'no-store',
        // Public pages: let the CDN keep one entry per request-cookie set
        // (each variant keyed by the customer's own cookie mirror), instead
        // of one shared entry that ignores identity entirely.
        ...(isPublic ? { vary: 'Cookie' } : {}),
        'x-edge-route': isPublic ? 'public' : 'private',
        'x-cache-key': cacheKey,
        ...securityHeaders(),
      },
    })
  }

  return next()
}