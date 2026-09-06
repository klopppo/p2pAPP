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

// Bumped to :v2 after the namespace-whitelist fix (audit M3 second half):
// payloads written by the pre-fix build may contain PII from queries we
// now filter out (user-profile, current-user, disputes, etc.). Discard
// those on first load by treating the old key as stale.
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
/**
 * Whitelist of React Query namespaces that are safe to persist to
 * localStorage. Anything not on this list (user-profile, current-user,
 * trades, trade, dispute, user-escrows, escrow-state, arbitration-cost,
 * appeal-info, notifications, messages, has-rated, user-reputation, ...)
 * is dropped on write — those contain PII, payment details, escrow
 * state, chat bodies, or auth signals we don't want to sit in
 * localStorage across sessions / wallet switches.
 */
const PERSISTABLE_NAMESPACES: ReadonlySet<string> = new Set([
  'offers', // marketplace list (the /app/offers list)
  'offer', // offer detail page (/app/offer/:id) — audit M4
  'conversation', // single conversation view
  'conversations', // conversation list for a user
  'user-reviews', // ratings received by a user (profile page)
  'trade-ratings', // ratings on a specific trade
  'notification-prefs', // per-channel enable/disable (no PII)
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
        if (!PERSISTABLE_NAMESPACES.has(firstKey)) continue
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
          `[queryPersister] wrote ${queries.length}/${all.length} queries (buster=${getBuster()}) — rest filtered by namespace whitelist`,
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
