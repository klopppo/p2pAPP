import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { StarRating } from '@/components/custom/StarRating'
import type { TradeRating } from '@/types/database'

/** Subset of TradeRating the breakdown needs; allows callers to pass rows
 *  with extra Supabase joins without an unsafe cast. */
interface RatingBreakdownProps {
  reviews: Array<Pick<TradeRating, 'score'>>
}

export function RatingBreakdown({ reviews }: RatingBreakdownProps) {
  const { t } = useTranslation()
  const total = reviews.length

  if (total === 0) return null

  const avg = reviews.reduce((sum, r) => sum + r.score, 0) / total

  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.score === star).length,
  }))

  const maxCount = Math.max(...counts.map((c) => c.count), 1)

  return (
    <div className="space-y-3">
      {/* Aggregate */}
      <div className="flex items-center gap-3">
        <Text variant="h3" className="font-bold font-mono">
          {avg.toFixed(1)}
        </Text>
        <div className="space-y-0.5">
          <StarRating value={Math.round(avg)} readonly size="sm" />
          <Text variant="muted" className="text-xs">
            {t(total === 1 ? 'review.reviewCount' : 'review.reviewCountPlural', { count: total })}
          </Text>
        </div>
      </div>

      {/* Distribution bars */}
      <div className="space-y-1.5">
        {counts.map(({ star, count }) => (
          <div key={star} className="flex items-center gap-2 text-sm">
            <span className="w-3 text-right text-muted-foreground font-mono text-xs">
              {star}
            </span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${(count / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right text-muted-foreground font-mono text-xs">
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
