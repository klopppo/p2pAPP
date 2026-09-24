import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { ReviewCard } from './ReviewCard'
import type { TradeRating } from '@/types/database'

type ReviewWithRater = TradeRating & {
  rater: { nickname: string | null; avatar_url: string | null } | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  reviews: ReviewWithRater[]
}

/**
 * Scrollable modal listing every review for a user. Opened from the "All
 * reviews" link in the profile's Ratings & Feedback card.
 */
export function ReviewsModal({ isOpen, onClose, reviews }: Props) {
  const { t } = useTranslation()
  const all = reviews

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="w-full max-w-lg"
          >
            <Card className="bg-background/95 backdrop-blur-xl shadow-2xl border border-border/60 rounded-2xl p-0 max-h-[85vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0">
                <Text variant="h4" className="font-bold">
                  {t('review.allReviews')}
                </Text>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('review.close')}
                  className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto px-6 divide-y divide-border/50">
                {all.length === 0 ? (
                  <Text variant="muted" className="text-sm py-8 text-center">
                    {t('review.noReviewsYet')}
                  </Text>
                ) : (
                  all.map((review) => <ReviewCard key={review.id} review={review} />)
                )}
              </div>
            </Card>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
