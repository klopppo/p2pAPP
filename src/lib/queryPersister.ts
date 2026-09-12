/**
 * Persist the TanStack Query cache to localStorage so the UI can render
 * the most recent snapshot of every list / detail page on reload, then
 * quietly revalidate from Supabase in the background.
 *
 * Approach: subscribe to the query cache and write the full snapshot to
 * localStorage on every mutation (rAF-throttled to coalesce rapid
 * invalidations). On the next page load, hydrate the cache BEFORE the
 * first render so any subsequent useQuery(...) call sees the cached
 * data and serves it immediately. `hydrateQueryCache` is exported as a
 * standalone helper so the call site can run it synchronously at module
 * init, *before* React mounts any component.
 *
 * No new dependency — TanStack Query's `getQueryCache()` /
 * `setQueryData()` cover everything we need.
 */
import type { QueryClient } from '@tanstack/react-query'

// v2 namespace: kept so existing installs don't lose their snapshot. Only
// `wallet-session` is filtered out on write/hydrate (see
// NON_PERSISTABLE_NAMESPACES) — everything else is persisted, wallet-scoped by
// the buster, so a cold start renders the last-known data immediately.
const STORAGE_KEY = 'coffernode:react-query:v2'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 // 24h

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
    return JSON.parse(raw) as PersistedClient
  } catch (err) {
    console.warn('[queryPersister] parse failed:', err)
    return null
  }
}

function safeWrite(payload: PersistedClient): void {
  if (typeof window === 'undefined') return
  const tryWrite = (p: PersistedClient) =>
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p))

  try {
    tryWrite(payload)
    return
  } catch {
    // Likely QuotaExceededError — the chat/message cache is the usual culprit.
    // Progressively drop the largest namespaces and retry so the lightweight
    // data (offers, trades, profile…) still persists.
  }

  const namespaceOf = (q: PersistedQuery) =>
    typeof q.queryKey?.[0] === 'string' ? (q.queryKey[0] as string) : ''
  const dropped = new Set<string>()
  for (const drop of ['messages', 'conversation', 'conversations', 'notifications', 'trades']) {
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
 * Hydrate the query cache synchronously. Call this AT MODULE INIT (before
 * the React tree mounts) so the first useQuery() call sees cached data
 * and doesn't fire a redundant Supabase request.
 *
 * `getBuster` is called inside the function so the buster is always
 * read fresh — mount the persister in a useEffect that depends on the
 * buster, but call `hydrateQueryCache` once at module init with a known
 * buster (e.g. 'anon' for the initial render, then the wallet-aware
 * value once the wallet connects).
 */
export function hydrateQueryCache(
  client: QueryClient,
  getBuster: () => string,
): void {
  const payload = safeRead()
  if (!payload) {
    if (typeof window !== 'undefined' && (window as { __coffernodeDebug?: boolean }).__coffernodeDebug) {
      console.log('[queryPersister] no persisted cache found')
    }
    return
  }
  if (payload.buster !== getBuster()) {
    if (typeof window !== 'undefined' && (window as { __coffernodeDebug?: boolean }).__coffernodeDebug) {
      console.log(
        `[queryPersister] cache buster mismatch (cached=${payload.buster}, current=${getBuster()}) — discarding`,
      )
    }
    return
  }
  if (Date.now() - payload.savedAt > MAX_AGE_MS) {
    if (typeof window !== 'undefined' && (window as { __coffernodeDebug?: boolean }).__coffernodeDebug) {
      console.log(
        `[queryPersister] cache expired (age=${Math.round((Date.now() - payload.savedAt) / 1000)}s > ${MAX_AGE_MS / 1000}s)`,
      )
    }
    return
  }
  let hydrated = 0
  for (const q of payload.queries) {
    const firstKey = q.queryKey?.[0]
    if (typeof firstKey === 'string' && NON_PERSISTABLE_NAMESPACES.has(firstKey)) {
      continue
    }
    // setQueryData with an `updatedAt` override so React Query treats the
    // entry as fresh-but-stale, triggering a background refetch on next
    // mount but serving the snapshot immediately.
    client.setQueryData(q.queryKey, q.data, {
      updatedAt: q.dataUpdatedAt,
    })
    hydrated++
  }
  if (typeof window !== 'undefined' && (window as { __coffernodeDebug?: boolean }).__coffernodeDebug) {
    console.log(
      `[queryPersister] hydrated ${hydrated} queries (buster=${getBuster()}, age=${Math.round((Date.now() - payload.savedAt) / 1000)}s)`,
    )
  }
}

/**
 * Mount the write-side subscription. Call this in a useEffect after the
 * QueryClientProvider mounts. The buster is read fresh on every write so
 * it stays in sync with wallet changes.
 */
/**
 * Namespaces that must NEVER be served from a stale snapshot.
 *
 *   - `wallet-session`: the live Supabase-session gate. Serving a stale
 *     "signed in" would let RLS-denied queries fire and mislead the navbar,
 *     so it must always be resolved fresh.
 *   - `trades`: the list combines a DB read with an on-chain phase read, and
 *     the phase is also mirrored to the dedicated `escrowStatusCache`. A
 *     hydrated snapshot can carry stale rows (old shape / old phase) that
 *     render an intermediate wrong tag ("Awaiting deposit") before the fresh
 *     fetch lands — so always fetch it fresh instead.
 */
const NON_PERSISTABLE_NAMESPACES: ReadonlySet<string> = new Set([
  'wallet-session',
  'trades',
])

/**
 * Mount the write-side subscription. Call this in a useEffect after the
 * QueryClientProvider mounts. The buster is read fresh on every write so
 * it stays in sync with wallet changes.
 */
export function attachQueryPersister(
  client: QueryClient,
  getBuster: () => string,
): () => void {
  let rafId: number | null = null
  const writeNow = () => {
    // Cancel any pending rAF so the synchronous write below doesn't get
    // double-fired by a later callback.
    if (rafId != null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
    try {
      const cache = client.getQueryCache()
      const all = cache.getAll()
      const queries: PersistedQuery[] = []
      for (const q of all) {
        const firstKey = q.queryKey[0]
        if (typeof firstKey !== 'string') continue
        if (NON_PERSISTABLE_NAMESPACES.has(firstKey)) continue
        queries.push({
          queryKey: q.queryKey,
          queryHash: q.queryHash,
          data: q.state.data,
          dataUpdatedAt: q.state.dataUpdatedAt,
        })
      }
      safeWrite({
        v: 1,
        buster: getBuster(),
        savedAt: Date.now(),
        queries,
      })
      if (typeof window !== 'undefined' && (window as { __coffernodeDebug?: boolean }).__coffernodeDebug) {
        console.log(
          `[queryPersister] wrote ${queries.length}/${all.length} queries (buster=${getBuster()}) — wallet-session/trades filtered`,
        )
      }
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
  // pagehide (mobile/bfcache) and beforeunload (desktop tab close) must
  // write SYNCHRONOUSLY — an rAF scheduled here will not flush before the
  // page is torn down, so the latest snapshot would be lost.
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

/**
 * Convenience helper for the common case: hydrate + attach in one call.
 * Hydration runs synchronously; the write subscription is scheduled.
 */
export function persistQueryClient(
  client: QueryClient,
  getBuster: () => string,
): () => void {
  hydrateQueryCache(client, getBuster)
  return attachQueryPersister(client, getBuster)
}

/**
 * Wipe the persisted cache. Useful on sign-out / wallet switch when
 * the buster alone isn't enough.
 */
export function clearPersistedQueryCache(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
