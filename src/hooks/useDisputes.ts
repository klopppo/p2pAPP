import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { getDisputeById, getDisputesByUser } from '@/lib/supabase'

/**
 * All disputes where the connected wallet is buyer or seller.
 * Disabled until a wallet is connected (no userId to filter on).
 */
export function useDisputes() {
  const { address } = useAccount()
  return useQuery({
    queryKey: ['disputes', 'by-wallet', address],
    queryFn: async () => {
      // The Supabase query path requires the user's UUID; the table has no
      // wallet-address column directly. Resolve wallet → uuid via getUserByWallet.
      const { getUserByWallet } = await import('@/lib/supabase')
      const user = address ? await getUserByWallet(address) : null
      if (!user) return []
      return getDisputesByUser(user.id)
    },
    enabled: !!address,
  })
}

/**
 * Single dispute by primary UUID, used by the detail viewer. Joins trade +
 * parties + evidence so the page renders without follow-up queries.
 */
export function useDispute(id: string | undefined) {
  return useQuery({
    queryKey: ['dispute', id],
    queryFn: () => getDisputeById(id as string),
    enabled: !!id,
  })
}
