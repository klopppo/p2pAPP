import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRatingsForTrade,
  getRatingsByUser,
  getRatedTradeIdsByUser,
  hasUserRatedTrade,
  submitTradeRating,
  updateUserReputation,
} from '@/lib/supabase'
import type { TradeRating } from '@/types/database'

/** Map 1-5 stars to a bounded reputation delta (-2..+2). */
const reputationDeltaForScore = (score: number) => Math.max(-2, Math.min(2, score - 3))

export function useTradeRatings(tradeId: string | undefined) {
  return useQuery({
    queryKey: ['trade-ratings', tradeId],
    queryFn: () => getRatingsForTrade(tradeId!),
    enabled: !!tradeId,
  })
}

export function useUserReviews(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-reviews', userId],
    queryFn: () => getRatingsByUser(userId!),
    enabled: !!userId,
  })
}

export function useHasRated(tradeId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['has-rated', tradeId, userId],
    queryFn: () => hasUserRatedTrade(tradeId!, userId!),
    enabled: !!tradeId && !!userId,
  })
}

/** Trade ids the user already rated — lets list pages hide the CTA in one read. */
export function useRatedTradeIds(userId: string | undefined) {
  return useQuery({
    queryKey: ['rated-trade-ids', userId],
    queryFn: () => getRatedTradeIdsByUser(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })
}

// Submit a rating, then best-effort bump the rated user's reputation via the
// RPC (a failure doesn't roll back the rating).
export function useSubmitRating() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (ratingData: Partial<TradeRating>) => {
      const data = await submitTradeRating(ratingData)
      if (ratingData.rated_id && typeof ratingData.score === 'number') {
        try {
          await updateUserReputation(ratingData.rated_id, reputationDeltaForScore(ratingData.score))
        } catch (_err) {
          console.warn('[useReviews.ts] _err:', _err)
        }
      }
      return data
    },
    onSuccess: (saved, variables) => {
      if (variables.trade_id && saved) {
        qc.setQueryData<TradeRating[]>(['trade-ratings', variables.trade_id], (prev) =>
          prev ? [saved, ...prev] : [saved],
        )
        qc.invalidateQueries({ queryKey: ['has-rated', variables.trade_id, variables.rater_id] })
        qc.invalidateQueries({ queryKey: ['rated-trade-ids', variables.rater_id] })
      }
      if (variables.rated_id && saved) {
        qc.setQueryData<TradeRating[]>(['user-reviews', variables.rated_id], (prev) =>
          prev ? [saved, ...prev] : [saved],
        )
        qc.invalidateQueries({ queryKey: ['user-profile'] })
        qc.invalidateQueries({ queryKey: ['user-reputation', variables.rated_id] })
      }
    },
  })
}
