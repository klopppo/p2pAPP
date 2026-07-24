import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import type { User } from '@/types/database'
import { upsertUser } from '@/lib/supabase'

/**
 * Resolves the connected wallet to a Supabase `users` row.
 *
 * The wallet is the canonical identity in this app (see `useSyncUser`), so
 * "the current user" is just `users` where `wallet_address = lowercased(address)`.
 *
 * Returns a TanStack Query result so the caller can read `data`, `isLoading`
 * and `error` directly without us hand-rolling a useState/useEffect dance.
 */
export function useCurrentUser() {
  const { address, isConnected } = useAccount()

  return useQuery<User | null>({
    queryKey: ['current-user', address],
    queryFn: async () => {
      if (!address) return null
      // upsertUser writes first (handy for first-connect onboarding), then
      // returns the row. So no separate "fetch or create" branch is needed.
      return upsertUser(address)
    },
    enabled: isConnected && !!address,
    staleTime: 60_000,
  })
}
