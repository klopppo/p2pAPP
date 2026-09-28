/**
 * Persist the TanStack Query cache to localStorage so the UI renders the last
 * snapshot on reload, then quietly revalidates. The write side subscribes to
 * the cache (rAF-throttled); `hydrateQueryCache` runs at module init, BEFORE
 * React mounts, so the first useQuery sees cached data.
 */
import type { QueryClient } from '@tanstack/react-query'

const STORAGE_KEY = 'coffernode:react-query:v2'
const MAX_AGE_MS = 1000 * 60 * 60 * 24

interface PersistedQuery {
  queryKey: readonly unknown[]
  queryHash: string
  data: unknown
  dataUpdatedAt: number
}

interface PersistedClient {
  v: 1
  buster: string
  savedAt: number
  queries: PersistedQuery[]
}

function safeRead(): PersistedClient | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    // Validate the envelope: a truncated/legacy payload must not crash module
    // init (`parsed.queries` could be undefined).
    const parsed = JSON.parse(raw) as Partial<PersistedClient> | null
    if (!parsed || parsed.v !== 1 || typeof parsed.buster !== 'string') return null
    if (typeof parsed.savedAt !== 'number' || !Array.isArray(parsed.queries)) return null
    return parsed as PersistedClient
  } catch (err) {
    console.warn('[queryPersister] parse failed:', err)
    return null
  }
}

function safeWrite(payload: PersistedClient): void {
  if (typeof window === 'undefined') return
  const tryWrite = (p: PersistedClient) => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p))

  try {
    tryWrite(payload)
    return
  } catch {
    // Likely QuotaExceededError — drop the largest namespaces and retry so the
    // lightweight data (offers, trades, profile…) still persists.
  }

  const namespaceOf = (q: PersistedQuery) =>
    typeof q.queryKey?.[0] === 'string' ? (q.queryKey[0] as string) : ''
  const dropped = new Set<string>()
  for (const drop of ['messages', 'conversation', 'conversations', 'notifications', 'trades', 'escrow-state', 'appeal-info', 'arbitration-cost']) {
    dropped.add(drop)
    const reduced: PersistedClient = {
      ...payload,
      queries: payload.queries.filter((q) => !dropped.has(namespaceOf(q))),
    }
    try {
      tryWrite(reduced)
      return
    } catch {
      // still too big — drop the next namespace and retry
    }
  }
  console.warn('[queryPersister] write failed (quota) even after pruning large namespaces')
}

/**
 * Hydrate synchronously; call at module init with a known buster (e.g. 'anon'),
 * then again wallet-aware. `skipExisting` lets already-seeded data (edge
 * hydration) win over the possibly-stale snapshot.
 */
export function hydrateQueryCache(
  client: QueryClient,
  getBuster: () => string,
  options?: { skipExisting?: boolean },
): void {
  const payload = safeRead()
  if (!payload) return
  if (payload.buster !== getBuster()) return
  if (Date.now() - payload.savedAt > MAX_AGE_MS) return

  for (const q of payload.queries) {
    if (!q || !Array.isArray(q.queryKey)) continue
    const firstKey = q.queryKey[0]
    if (typeof firstKey === 'string' && NON_PERSISTABLE_NAMESPACES.has(firstKey)) continue
    if (options?.skipExisting && client.getQueryData(q.queryKey) !== undefined) continue
    // Serve the snapshot immediately but mark it stale via `updatedAt`.
    client.setQueryData(q.queryKey, q.data, { updatedAt: q.dataUpdatedAt })
  }
}

/**
 * Namespaces that must NEVER be served from a stale snapshot:
 *   - `wallet-session`: the live session gate — a stale "signed in" would let
 *     RLS-denied queries fire and mislead the navbar.
 *   - `trades`: combines DB + on-chain phase; a stale shape renders a wrong tag.
 *   - the bigint-carrying namespaces: JSON.stringify throws on bigint, which
 *     would abort the whole snapshot write.
 */
const NON_PERSISTABLE_NAMESPACES: ReadonlySet<string> = new Set([
  'wallet-session',
  'trades',
  'escrow-state',
  'appeal-info',
  'arbitration-cost',
])

/** Mount the write-side subscription (call in a useEffect). Returns teardown. */
export function attachQueryPersister(client: QueryClient, getBuster: () => string): () => void {
  let rafId: number | null = null
  const writeNow = () => {
    if (rafId != null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
    try {
      const all = client.getQueryCache().getAll()
      const queries: PersistedQuery[] = []
      for (const q of all) {
        const firstKey = q.queryKey[0]
        if (typeof firstKey !== 'string') continue
        if (NON_PERSISTABLE_NAMESPACES.has(firstKey)) continue
        // Belt-and-braces: a namespace we didn't anticipate may still hold a
        // bigint (JSON.stringify throws). Skip just that query.
        try {
          JSON.stringify(q.state.data)
        } catch {
          continue
        }
        queries.push({
          queryKey: q.queryKey,
          queryHash: q.queryHash,
          data: q.state.data,
          dataUpdatedAt: q.state.dataUpdatedAt,
        })
      }
      safeWrite({ v: 1, buster: getBuster(), savedAt: Date.now(), queries })
    } catch (err) {
      console.warn('[queryPersister] snapshot failed:', err)
    }
  }
  const writeSoon = () => {
    if (rafId != null) return
    rafId = window.requestAnimationFrame(() => {
      rafId = null
      writeNow()
    })
  }

  const unsub = client.getQueryCache().subscribe(writeSoon)
  // pagehide (mobile/bfcache) and beforeunload (desktop) must write
  // SYNCHRONOUSLY — an rAF scheduled here would not flush before teardown.
  const onHide = () => writeNow()
  window.addEventListener('pagehide', onHide)
  window.addEventListener('beforeunload', onHide)

  return () => {
    unsub()
    if (rafId != null) window.cancelAnimationFrame(rafId)
    window.removeEventListener('pagehide', onHide)
    window.removeEventListener('beforeunload', onHide)
  }
}

/** Wipe the persisted cache (sign-out / wallet switch). */
export function clearPersistedQueryCache(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
