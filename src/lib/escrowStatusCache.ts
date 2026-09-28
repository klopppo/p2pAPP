/**
 * Tiny localStorage cache of the last-known on-chain escrow phase, keyed by
 * contract address. Gives the UI an instant value on reload while the fresh
 * on-chain read is in flight (the DB mirror can be stale).
 */

const KEY = 'coffernode:escrow-live-status'
const MAX_ENTRIES = 300

type StatusMap = Record<string, string>

function read(): StatusMap {
  if (typeof window === 'undefined') return {}
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '')
    return parsed && typeof parsed === 'object' ? (parsed as StatusMap) : {}
  } catch {
    return {}
  }
}

export function getCachedEscrowStatus(escrowAddress: string | null | undefined): string | null {
  if (!escrowAddress) return null
  return read()[escrowAddress.toLowerCase()] ?? null
}

export function setCachedEscrowStatus(escrowAddress: string, status: string): void {
  if (typeof window === 'undefined' || !escrowAddress || !status) return
  try {
    const map = read()
    map[escrowAddress.toLowerCase()] = status
    const keys = Object.keys(map)
    // Drop the oldest inserted entries (object insertion order).
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[k]
    }
    window.localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // storage disabled/full — ignore
  }
}
