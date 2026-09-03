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

const STORAGE_KEY = 'coffernode:react-query:v1'
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
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (err) {
    // Quota exceeded or storage disabled — silently drop. The next write
    // attempt will retry on the next mutation.
    console.warn('[queryPersister] write failed:', err)
  }
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
export function attachQueryPersister(
  client: QueryClient,
  getBuster: () => string,
): () => void {
  let rafId: number | null = null
  const writeSoon = () => {
    if (rafId != null) return
    rafId = window.requestAnimationFrame(() => {
      rafId = null
      try {
        const cache = client.getQueryCache()
        const queries: PersistedQuery[] = cache
          .getAll()
          .map((q) => ({
            queryKey: q.queryKey,
            queryHash: q.queryHash,
            data: q.state.data,
            dataUpdatedAt: q.state.dataUpdatedAt,
          }))
        safeWrite({
          v: 1,
          buster: getBuster(),
          savedAt: Date.now(),
          queries,
        })
        if (typeof window !== 'undefined' && (window as { __coffernodeDebug?: boolean }).__coffernodeDebug) {
          console.log(
            `[queryPersister] wrote ${queries.length} queries (buster=${getBuster()})`,
          )
        }
      } catch (err) {
        console.warn('[queryPersister] snapshot failed:', err)
      }
    })
  }

  const unsub = client.getQueryCache().subscribe(writeSoon)
  const onHide = () => writeSoon()
  // pagehide covers mobile (bfcache flush); beforeunload covers desktop
  // tab close. Both flush the pending rAF synchronously.
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
