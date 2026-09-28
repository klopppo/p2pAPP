import { useQuery } from '@tanstack/react-query'
import { getReferralDashboard } from '@/lib/supabase'
import { useWalletSession } from './useWalletSession'

/** Invite & Earn dashboard (reads are owner-scoped by RLS). */
export function useReferralDashboard(userId: string | undefined) {
  const { hasSession } = useWalletSession()
  return useQuery({
    queryKey: ['referral-dashboard', userId],
    queryFn: () => getReferralDashboard(userId as string),
    enabled: !!userId && hasSession,
  })
}
