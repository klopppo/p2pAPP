import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { getSessionWallet } from '@/lib/supabase'

/**
 * Live Supabase session gate.
 *
 * A connected wallet — and the world-readable `users` row it resolves to — is
 * NOT proof of an authenticated session. The RLS layer authorizes off the JWT
 * `wallet_address` claim, so without a matching live token every
 * participant-scoped read silently returns `[]` (messages, conversations,
 * trades…). This hook exposes the real signal: the wallet encoded in the
 * active Supabase JWT.
 *
 * `refetchInterval` covers two cases the query key alone can't:
 *   1. Cold-load restore race — React Query mounts before supabase-js has
 *      finished restoring the persisted session, so the first read is anon.
 *   2. A silently expired JWT — the session disappears without a wallet event.
 * In both the gate flips on the next tick instead of requiring a reload.
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
  // The token must exist AND belong to the currently connected wallet — a
  // stale session for a previously connected address must not authorize.
  const hasSession = !!sessionWallet && sessionWallet === addr

  return {
    address: addr,
    sessionWallet,
    hasSession,
    isLoading: query.isLoading,
    refetch: query.refetch,
  }
}
