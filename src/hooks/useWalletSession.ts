import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { getSessionWallet } from '@/lib/supabase'

/**
 * Live Supabase session gate. RLS authorizes off the JWT `wallet_address`
 * claim, so the token must exist AND belong to the currently connected wallet.
 * `refetchInterval` covers the cold-load restore race and expired JWTs.
 */
export function useWalletSession() {
  const { address, isConnected } = useAccount()
  const addr = address?.toLowerCase() ?? null

  const query = useQuery<string | null>({
    queryKey: ['wallet-session', addr],
    queryFn: () => getSessionWallet(),
    enabled: isConnected && !!addr,
    staleTime: 10_000,
    refetchInterval: 10_000,
  })

  const sessionWallet = query.data?.toLowerCase() ?? null
  return {
    address: addr,
    sessionWallet,
    hasSession: !!sessionWallet && sessionWallet === addr,
    isLoading: query.isLoading,
    refetch: query.refetch,
  }
}
