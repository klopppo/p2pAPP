import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRatingsForTrade,
  getRatingsByUser,
  hasUserRatedTrade,
  submitTradeRating,
} from '@/lib/supabase'
import type { TradeRating } from '@/types/database'

/**
 * Fetch all ratings for a specific trade (buyer ↔ seller).
 */
export function useTradeRatings(tradeId: string | undefined) {
  return useQuery({
    queryKey: ['trade-ratings', tradeId],
    queryFn: () => getRatingsForTrade(tradeId!),
    enabled: !!tradeId,
  })
}

/**
 * Fetch all ratings where a specific user was rated (for profile page).
 */
export function useUserReviews(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-reviews', userId],
    queryFn: () => getRatingsByUser(userId!),
    enabled: !!userId,
  })
}

/**
 * Check if the current user has already rated a specific trade.
 */
export function useHasRated(
  tradeId: string | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: ['has-rated', tradeId, userId],
    queryFn: () => hasUserRatedTrade(tradeId!, userId!),
    enabled: !!tradeId && !!userId,
  })
}

/**
 * Submit a rating for a trade. Invalidates relevant caches on success.
 */
export function useSubmitRating() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (ratingData: Partial<TradeRating>) =>
      submitTradeRating(ratingData),
    onSuccess: (_data, variables) => {
      if (variables.trade_id) {
        qc.invalidateQueries({ queryKey: ['trade-ratings', variables.trade_id] })
        qc.invalidateQueries({
          queryKey: ['has-rated', variables.trade_id, variables.rater_id],
        })
      }
      if (variables.rated_id) {
        qc.invalidateQueries({ queryKey: ['user-reviews', variables.rated_id] })
        qc.invalidateQueries({ queryKey: ['user-profile'] })
      }
    },
  })
}
