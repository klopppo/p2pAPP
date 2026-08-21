import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { StarRating } from '@/components/custom/StarRating'
import type { TradeRating } from '@/types/database'

interface ReviewCardProps {
  review: TradeRating & {
    rater: { nickname: string | null; avatar_url: string | null } | null
  }
}

function timeAgo(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return t('review.justNow')
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return t('review.minutesAgo', { count: diffMin })
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return t('review.hoursAgo', { count: diffHr })
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return t('review.daysAgo', { count: diffDay })
  const diffMo = Math.floor(diffDay / 30)
  return t('review.monthsAgo', { count: diffMo })
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
        <div className="flex items-center gap-2">
          <Text variant="small" className="font-medium">
            {displayName}
          </Text>
          <StarRating value={review.score} readonly size="sm" />
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {timeAgo(review.submitted_at, t)}
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
