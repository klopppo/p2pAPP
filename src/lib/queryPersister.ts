/**
 * Persist the TanStack Query cache to localStorage so the UI can render
 * the most recent snapshot of every list / detail page on reload, then
 * quietly revalidate from Supabase in the background.
 *
 * Approach: subscribe to the query cache and write the snapshot to
 * localStorage on every mutation / refetch / invalidation. On the next
 * page load, hydrate the cache before the first render so any subsequent
 * useQuery(...) call sees the cached data and serves it immediately.
 *
 * Buster key includes the connected wallet address (when known) so
 * disconnecting / switching wallets invalidates the cache without manual
 * clearing. Stale data (older than MAX_AGE_MS) is discarded on read.
 *
 * No new dependency — TanStack Query's `getQueryCache().subscribe()` and
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
 * Mount the persister. Returns an unsubscribe function. Call once in the
 * app's root (after QueryClient is created) so the cache hydrates before
 * the first query fires.
 *
 * `getBuster` is called whenever the buster is needed so that buster
 * changes (e.g. wallet switch) cause the next read to discard the cache.
 */
export function persistQueryClient(
  client: QueryClient,
  getBuster: () => string,
): () => void {
  // Hydrate before the first render. Skip if the buster changed (cache
  // belongs to a different user/wallet) or the entry is older than
  // MAX_AGE_MS.
  const payload = safeRead()
  if (payload) {
    if (payload.buster === getBuster() && Date.now() - payload.savedAt <= MAX_AGE_MS) {
      for (const q of payload.queries) {
        // setQueryData with a `updatedAt` override so React Query treats
        // the entry as fresh-but-stale, triggering a background refetch
        // on next mount but serving the snapshot immediately.
        client.setQueryData(q.queryKey, q.data, {
          updatedAt: q.dataUpdatedAt,
        })
      }
    }
  }

  // Write on every cache mutation. Throttle with rAF to avoid hammering
  // localStorage on rapid-fire invalidations (e.g. a chat page that
  // receives 5 messages in a row).
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
