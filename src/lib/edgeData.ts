import type { QueryClient } from '@tanstack/react-query'

/**
 * Read the public data blob the edge middleware injected into the SPA shell
 * (functions/_middleware.ts → `#__EDGE_DATA__`) and seed the react-query cache
 * BEFORE the first render, so public detail/list pages paint instantly on a
 * deep link with zero skeleton flash and no redundant first fetch.
 *
 * The DOM node is a non-executable `<script type="application/json">` — CSP
 * safe. It is removed after reading.
 */

const EDGE_DATA_ID = '__EDGE_DATA__'

export interface EdgeDataEnvelope {
  pathname: string
  publicData: {
    offers?: unknown[]
    offer?: unknown
    profile?: unknown
  }
}

function readEdgeData(): EdgeDataEnvelope | null {
  if (typeof document === 'undefined') return null
  const el = document.getElementById(EDGE_DATA_ID)
  if (!el?.textContent || el.textContent.trim() === '') return null
  try {
    return JSON.parse(el.textContent) as EdgeDataEnvelope
  } catch (err) {
    console.warn('[edgeData] failed to parse #__EDGE_DATA__:', err)
    return null
  } finally {
    el.remove()
  }
}

/**
 * Seed the cache. Keys mirror src/lib/supabase hooks exactly:
 *   - ['offers']                 ← useOffers (getActiveOffers)
 *   - ['offer', id]              ← useOffer (getOfferById)
 *   - ['user-profile', address]  ← useUserProfile (ensureUser)
 *
 * `updatedAt: now()` marks the entry fresh for the default staleTime (5s),
 * then a quiet background refetch reconciles with the live DB.
 */
export function seedEdgeData(queryClient: QueryClient): void {
  const payload = readEdgeData()
  if (!payload) return
  const { pathname, publicData } = payload
  const updatedAt = Date.now()

  if (pathname === '/app/offers' && Array.isArray(publicData.offers)) {
    queryClient.setQueryData(['offers'], publicData.offers, { updatedAt })
    return
  }

  const offer = pathname.match(/^\/app\/offer\/([^/]+)$/)
  if (offer) {
    const id = decodeURIComponent(offer[1])
    if (publicData.offer != null) {
      queryClient.setQueryData(['offer', id], publicData.offer, { updatedAt })
    }
    return
  }

  const profile = pathname.match(/^\/app\/profile\/([^/]+)$/)
  if (profile && publicData.profile != null) {
    const address = decodeURIComponent(profile[1]).toLowerCase()
    queryClient.setQueryData(['user-profile', address], publicData.profile, { updatedAt })
  }
}