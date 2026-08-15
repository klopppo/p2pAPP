import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { getTradesByUser, getUserByWallet } from '@/lib/supabase'

/**
 * All trades where the connected wallet is buyer or seller, newest first.
 * Disabled until a wallet is connected (no user id to filter on).
 */
export function useTrades() {
  const { address } = useAccount()
  return useQuery({
    queryKey: ['trades', 'by-wallet', address],
    queryFn: async () => {
      const user = address ? await getUserByWallet(address) : null
      if (!user) return []
      return getTradesByUser(user.id)
    },
    enabled: !!address,
  })
}
