import type { User } from '@/types/database'

const CACHE_PREFIX = 'p2p_user_'
const CACHE_TTL_MS = 5 * 60 * 1000

interface CachedUser {
  data: User
  ts: number
}

function cacheKey(walletAddress: string): string {
  return `${CACHE_PREFIX}${walletAddress.toLowerCase()}`
}

export function getCachedUser(walletAddress: string): User | null {
  try {
    const raw = localStorage.getItem(cacheKey(walletAddress))
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedUser | null
    // Malformed/legacy entry (missing `data`/`ts`) or expired → miss.
    if (!cached || typeof cached.ts !== 'number' || !cached.data || Date.now() - cached.ts > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(walletAddress))
      return null
    }
    return cached.data
  } catch {
    return null
  }
}

export function setCachedUser(user: User): void {
  try {
    localStorage.setItem(cacheKey(user.wallet_address), JSON.stringify({ data: user, ts: Date.now() }))
  } catch {
    // localStorage full or disabled — ignore
  }
}

export function invalidateUserCache(walletAddress: string): void {
  try {
    localStorage.removeItem(cacheKey(walletAddress))
  } catch {
    // storage disabled — nothing to invalidate
  }
}

export function clearAllUserCache(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    // storage disabled — nothing to clear
  }
}
