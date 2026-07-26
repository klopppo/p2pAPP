import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Separator } from '@/components/ui/separator'
import { useUserReviews } from '@/hooks/useReviews'
import { RatingBreakdown } from '@/components/custom/RatingBreakdown'
import { ReviewCard } from '@/components/custom/ReviewCard'
import { Loader2 } from 'lucide-react'

interface ReviewListProps {
  userId: string
}

const PAGE_SIZE = 20

export function ReviewList({ userId }: ReviewListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const { data: reviews = [], isLoading } = useUserReviews(userId)

  const visible = reviews.slice(0, visibleCount)
  const hasMore = visibleCount < reviews.length

  if (isLoading) {
    return (
      <Card className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading reviews…
        </div>
      </Card>
    )
  }

  return (
    <Card className="glass-panel rounded-2xl p-6">
      <div className="space-y-4">
        <Text variant="h4" className="font-bold">
          Ratings & Feedback
        </Text>

        {reviews.length === 0 ? (
          <Text variant="muted" className="text-sm py-4 text-center">
            No reviews yet
          </Text>
        ) : (
          <>
            <RatingBreakdown reviews={reviews} />

            <Separator />

            <div className="divide-y divide-border/50">
              {visible.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>

            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full mx-auto"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Load more ({reviews.length - visibleCount} remaining)
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
