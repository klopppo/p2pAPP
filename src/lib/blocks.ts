const KEY_PREFIX = 'coffernode:blocked:'

function getBlockedUserIds(currentUserId: string): string[] {
  if (typeof window === 'undefined' || !currentUserId) return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(`${KEY_PREFIX}${currentUserId}`) ?? '')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function isUserBlocked(currentUserId: string, targetUserId: string): boolean {
  if (!currentUserId || !targetUserId) return false
  return getBlockedUserIds(currentUserId).includes(targetUserId)
}

/** Block / unblock a user (device-local; server-side enforcement is out of scope). */
export function setUserBlocked(currentUserId: string, targetUserId: string, blocked: boolean): void {
  if (typeof window === 'undefined' || !currentUserId || !targetUserId) return
  const current = new Set(getBlockedUserIds(currentUserId))
  if (blocked) current.add(targetUserId)
  else current.delete(targetUserId)
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${currentUserId}`, JSON.stringify([...current]))
  } catch {
    // storage disabled/full — ignore
  }
}
