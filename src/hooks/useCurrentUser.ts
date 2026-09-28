import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import type { User } from '@/types/database'
import { ensureUser } from '@/lib/supabase'

/** Resolve the connected wallet to its `users` row (read-through cache). */
export function useCurrentUser() {
  const { address, isConnected } = useAccount()

  return useQuery<User | null>({
    queryKey: ['current-user', address],
    queryFn: async () => {
      if (!address) return null
      return ensureUser(address)
    },
    enabled: isConnected && !!address,
    staleTime: 60_000,
  })
}
