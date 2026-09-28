import type { QueryClient } from '@tanstack/react-query'

/**
 * Seed react-query from the public data blob the edge middleware injected into
 * the SPA shell (`#__EDGE_DATA__`), BEFORE the first render, so public pages
 * paint instantly on a deep link. The node is a non-executable JSON script
 * (CSP safe) and is removed after reading.
 */

const EDGE_DATA_ID = '__EDGE_DATA__'

interface EdgeDataEnvelope {
  pathname: string
  publicData: { offers?: unknown[]; offer?: unknown; profile?: unknown }
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

/** Keys mirror the hooks exactly: ['offers'], ['offer', id], ['user-profile', addr]. */
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
    if (publicData.offer != null) {
      queryClient.setQueryData(['offer', decodeURIComponent(offer[1])], publicData.offer, { updatedAt })
    }
    return
  }

  const profile = pathname.match(/^\/app\/profile\/([^/]+)$/)
  if (profile && publicData.profile != null) {
    queryClient.setQueryData(
      ['user-profile', decodeURIComponent(profile[1]).toLowerCase()],
      publicData.profile,
      { updatedAt },
    )
  }
}
