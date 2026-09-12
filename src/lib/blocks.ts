const KEY_PREFIX = 'coffernode:blocked:'

function storageKey(currentUserId: string): string {
  return `${KEY_PREFIX}${currentUserId}`
}

/** User ids the current user has blocked on this device. */
export function getBlockedUserIds(currentUserId: string): string[] {
  if (typeof window === 'undefined' || !currentUserId) return []
  try {
    const raw = window.localStorage.getItem(storageKey(currentUserId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    return []
  }
}

export function isUserBlocked(currentUserId: string, targetUserId: string): boolean {
  if (!currentUserId || !targetUserId) return false
  return getBlockedUserIds(currentUserId).includes(targetUserId)
}

/**
 * Block / unblock a user (device-local). Blocked chats are muted and their
 * composer is disabled — server-side enforcement is out of scope for now.
 */
export function setUserBlocked(
  currentUserId: string,
  targetUserId: string,
  blocked: boolean,
): void {
  if (typeof window === 'undefined' || !currentUserId || !targetUserId) return
  const current = new Set(getBlockedUserIds(currentUserId))
  if (blocked) current.add(targetUserId)
  else current.delete(targetUserId)
  try {
    window.localStorage.setItem(storageKey(currentUserId), JSON.stringify([...current]))
  } catch {
    /* storage disabled/full — ignore */
  }
}
