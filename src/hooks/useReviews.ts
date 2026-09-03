import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRatingsForTrade,
  getRatingsByUser,
  getReputationScores,
  hasUserRatedTrade,
  submitTradeRating,
  updateUserReputation,
} from '@/lib/supabase'
import type { ReputationScore, TradeRating } from '@/types/database'

/** Map a 1-5 star rating to a bounded reputation delta (-2..+2). The
 *  `increment_reputation_score` RPC clamps the overall score to [0,100], so
 *  unbounded deltas are safe but noisy. */
function reputationDeltaForScore(score: number): number {
  return Math.max(-2, Math.min(2, score - 3))
}

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
 * Fetch the cached reputation_scores row for a user. Null if the row doesn't
 * exist yet (the seed happens lazily via the increment_reputation_score RPC).
 */
export function useUserReputation(userId: string | undefined) {
  return useQuery<ReputationScore | null>({
    queryKey: ['user-reputation', userId],
    queryFn: () => getReputationScores(userId!),
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
 * Submit a rating for a trade. Bumps the rated user's reputation via the
 * `increment_reputation_score` RPC after the row lands. Reputation update is
 * best-effort — a failure logs but doesn't roll back the rating itself.
 *
 * Optimistic cache: pushes the saved row into the `['trade-ratings', tradeId]`
 * and `['user-reviews', ratedId]` cache so the rating appears in the
 * trade detail / profile page immediately (no Supabase round-trip on the
 * user's own action). Falls back to `invalidateQueries` if the
 * `setQueryData` shape doesn't match the existing cache.
 */
export function useSubmitRating() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (ratingData: Partial<TradeRating>) => {
      const data = await submitTradeRating(ratingData)
      if (ratingData.rated_id && typeof ratingData.score === 'number') {
        try {
          await updateUserReputation(
            ratingData.rated_id,
            reputationDeltaForScore(ratingData.score),
          )
        } catch (_err) {
        console.warn('[useReviews.ts] _err:', _err);/* swallow */ }
      }
      return data
    },
    onSuccess: (saved, variables) => {
      if (variables.trade_id && saved) {
        // Push the new rating into the trade's rating list so the row shows
        // up immediately when the modal closes.
        qc.setQueryData<TradeRating[]>(
          ['trade-ratings', variables.trade_id],
          (prev) => (prev ? [saved, ...prev] : [saved]),
        )
        qc.invalidateQueries({
          queryKey: ['has-rated', variables.trade_id, variables.rater_id],
        })
      }
      if (variables.rated_id && saved) {
        // Push the new rating into the rated user's review list so the
        // profile page's RatingBreakdown updates without a round-trip.
        qc.setQueryData<TradeRating[]>(
          ['user-reviews', variables.rated_id],
          (prev) => (prev ? [saved, ...prev] : [saved]),
        )
        qc.invalidateQueries({ queryKey: ['user-profile'] })
        // Reputation: also push the new overall score (or just invalidate so
        // the next page view refetches the deltas).
        qc.invalidateQueries({ queryKey: ['user-reputation', variables.rated_id] })
      }
    },
  })
}
