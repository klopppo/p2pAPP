import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import type { User } from '@/types/database'
import { ensureUser } from '@/lib/supabase'

/**
 * Resolves the connected wallet to a Supabase `users` row.
 *
 * The wallet is the canonical identity in this app (see `useSyncUser`), so
 * "the current user" is just `users` where `wallet_address = lowercased(address)`.
 *
 * Uses `ensureUser` which reads from cache first, then DB. Does NOT overwrite
 * profile fields.
 */
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
