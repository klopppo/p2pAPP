/**
 * Tiny localStorage cache of the last-known on-chain escrow phase, keyed by
 * escrow contract address.
 *
 * The DB `escrow_status` mirror can be stale, and the React Query snapshot may
 * be pruned (quota) or miss the current key — this gives the UI an instant,
 * last-known-correct value on reload while the fresh on-chain read is in
 * flight. It is written whenever we successfully derive a phase.
 */

const KEY = 'coffernode:escrow-live-status'
/** Cap the map so it can't grow unbounded (LRU-ish by insertion). */
const MAX_ENTRIES = 300

type StatusMap = Record<string, string>

function read(): StatusMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as StatusMap) : {}
  } catch {
    return {}
  }
}

export function getCachedEscrowStatus(
  escrowAddress: string | null | undefined,
): string | null {
  if (!escrowAddress) return null
  return read()[escrowAddress.toLowerCase()] ?? null
}

export function setCachedEscrowStatus(escrowAddress: string, status: string): void {
  if (typeof window === 'undefined' || !escrowAddress || !status) return
  try {
    const map = read()
    map[escrowAddress.toLowerCase()] = status
    const keys = Object.keys(map)
    if (keys.length > MAX_ENTRIES) {
      // Drop the oldest inserted entries (object insertion order).
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[k]
    }
    window.localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* storage disabled/full — ignore */
  }
}
