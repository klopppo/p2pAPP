import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { getTradesByUser, getUserByWallet } from '@/lib/supabase'
import { useWalletSession } from './useWalletSession'

/**
 * All trades where the connected wallet is buyer or seller, newest first.
 *
 * Gated on a live Supabase session, not just a wallet: `trades_select_parties`
 * authorizes off the JWT claim, so an unauthenticated read would return `[]`
 * with no error (the "connected but empty" failure mode). The session wallet is
 * in the key so completing SIWE / switching wallets refetches.
 */
export function useTrades() {
  const { address } = useAccount()
  const { sessionWallet, hasSession } = useWalletSession()
  return useQuery({
    queryKey: ['trades', 'by-wallet', address, sessionWallet],
    queryFn: async () => {
      const user = address ? await getUserByWallet(address) : null
      if (!user) return []
      return getTradesByUser(user.id)
    },
    enabled: !!address && hasSession,
  })
}
