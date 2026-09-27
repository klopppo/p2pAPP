// Shared on-device SIWE markers: `coffernode:siwe:last` remembers the wallet
// that completed the challenge (silent session recovery / signed-in UI);
// `coffernode:siwe:declined:<addr>` suppresses re-prompting MetaMask for a
// wallet the user explicitly rejected.

const SUCCESS_KEY = 'coffernode:siwe:last'
const REJECTED_KEY_PREFIX = 'coffernode:siwe:declined:'

function readSignedInAddress(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SUCCESS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { address?: string }
    return typeof parsed.address === 'string' ? parsed.address.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * Whether this device already completed SIWE for `addr` (remember-me marker).
 * A marker means we must NOT auto-prompt MetaMask on reload — only an explicit
 * Disconnect clears it.
 */
export function hasSignedInMarker(addr: string): boolean {
  return readSignedInAddress() === addr.toLowerCase()
}

/** Whether the given wallet has a persisted "declined sign-in" marker. */
export function hasRejectedMarker(addr: string | null): boolean {
  if (typeof window === 'undefined' || !addr) return false
  return window.localStorage.getItem(`${REJECTED_KEY_PREFIX}${addr.toLowerCase()}`) === '1'
}
