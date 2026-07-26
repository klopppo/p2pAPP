import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { StarRating } from '@/components/custom/StarRating'
import type { TradeRating } from '@/types/database'

interface ReviewCardProps {
  review: TradeRating & {
    rater: { nickname: string | null; avatar_url: string | null } | null
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMo = Math.floor(diffDay / 30)
  return `${diffMo}mo ago`
}

export function ReviewCard({ review }: ReviewCardProps) {
  const displayName = review.anonymous
    ? 'Anonymous'
    : review.rater?.nickname ?? 'Trader'

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
            {timeAgo(review.submitted_at)}
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
