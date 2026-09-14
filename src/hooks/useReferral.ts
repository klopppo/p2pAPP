import { useQuery } from '@tanstack/react-query'
import { getReferralDashboard } from '@/lib/supabase'

/**
 * Invite & Earn dashboard for the signed-in user. Disabled until we know the
 * user id (must be authenticated — the reads are owner-scoped by RLS).
 */
export function useReferralDashboard(userId: string | undefined) {
  return useQuery({
    queryKey: ['referral-dashboard', userId],
    queryFn: () => getReferralDashboard(userId as string),
    enabled: !!userId,
  })
}