import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { StarRating } from '@/components/custom/StarRating'
import { timeAgo } from '@/components/custom/timeAgo'
import type { TradeRating } from '@/types/database'

interface ReviewCardProps {
  review: TradeRating & {
    rater: { nickname: string | null; avatar_url: string | null } | null
  }
}

const REVIEW_TIME_KEYS = {
  now: 'review.justNow',
  minutes: 'review.minutesAgo',
  hours: 'review.hoursAgo',
  days: 'review.daysAgo',
  months: 'review.monthsAgo',
}

export function ReviewCard({ review }: ReviewCardProps) {
  const { t } = useTranslation()
  const displayName = review.anonymous
    ? t('tradeDetail.anonymous')
    : review.rater?.nickname ?? t('tradeDetail.trader')

  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex items-start gap-3 py-3">
      <Avatar className="h-8 w-8 shrink-0">
        {!review.anonymous && (
          <AvatarImage src={review.rater?.avatar_url ?? undefined} />
        )}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Text variant="small" className="font-medium truncate">
            {displayName}
          </Text>
          <StarRating value={review.score} readonly size="sm" />
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {timeAgo(review.submitted_at, t, REVIEW_TIME_KEYS)}
          </span>
        </div>

        {review.comment && (
          <Text variant="muted" className="text-sm leading-relaxed">
            {review.comment}
          </Text>
        )}
      </div>
    </div>
  )
}
