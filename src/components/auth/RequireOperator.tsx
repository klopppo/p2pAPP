import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWalletSession } from '@/hooks/useWalletSession'

/**
 * Server-side operator gate for `/app/operator`.
 *
 * The RBAC portal must never be reachable by an ordinary signed-in user: the
 * dashboard's identity/permission layer is client-side, so the only trustworthy
 * boundary is `public.is_operator()` (SECURITY DEFINER, checks the admin-only
 * `app_metadata.wallet_address` against an ACTIVE `sys_operators` row). Anyone
 * else is bounced to the marketplace.
 */
export function RequireOperator({ children }: { children: ReactNode }) {
  const { sessionWallet, hasSession, isLoading: sessionLoading } =
    useWalletSession()

  const { data: isOperator, isLoading } = useQuery({
    queryKey: ['is-operator', sessionWallet],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_operator')
      if (error) throw error
      return data === true
    },
    enabled: hasSession,
    staleTime: 60_000,
  })

  if (sessionLoading) return null
  if (!hasSession) return <Navigate to="/app/offers" replace />
  if (isLoading) return null
  if (!isOperator) return <Navigate to="/app/offers" replace />

  return <>{children}</>
}
