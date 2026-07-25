import type { User } from '@/types/database'

const CACHE_PREFIX = 'p2p_user_'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

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
    const cached: CachedUser = JSON.parse(raw)
    if (Date.now() - cached.ts > CACHE_TTL_MS) {
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
    const cached: CachedUser = { data: user, ts: Date.now() }
    localStorage.setItem(cacheKey(user.wallet_address), JSON.stringify(cached))
  } catch {
    // localStorage full or disabled — ignore
  }
}

export function invalidateUserCache(walletAddress: string): void {
  localStorage.removeItem(cacheKey(walletAddress))
}

export function clearAllUserCache(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(CACHE_PREFIX)) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}
