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

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * TEMPORARY mock reviews so the "All reviews" modal can be visually checked.
 * Remove this array (and the `MOCK_REVIEWS` spread below) once enough real
 * reviews exist.
 */
const MOCK_REVIEWS: ReviewWithRater[] = [
  {
    id: 'mock-1',
    trade_id: 'TRD-MOCK-1',
    rater_id: 'mock-u1',
    rated_id: 'me',
    direction: 'seller',
    score: 4,
    comment:
      'ciao questo è andato molto bene sono soddisfatto del prodotto, mi aspettavo un tempistica peggiore ha un fee esibizionista',
    anonymous: false,
    submitted_at: daysAgo(1),
    rater: { nickname: 'Test', avatar_url: null },
  },
  {
    id: 'mock-2',
    trade_id: 'TRD-MOCK-2',
    rater_id: 'mock-u2',
    rated_id: 'me',
    direction: 'buyer',
    score: 5,
    comment: 'Fast release, very smooth communication. Recommended trader!',
    anonymous: false,
    submitted_at: daysAgo(3),
    rater: { nickname: 'Marco', avatar_url: null },
  },
  {
    id: 'mock-3',
    trade_id: 'TRD-MOCK-3',
    rater_id: 'mock-u3',
    rated_id: 'me',
    direction: 'seller',
    score: 5,
    comment: 'Punctual and precise. Would definitely trade again.',
    anonymous: true,
    submitted_at: daysAgo(6),
    rater: null,
  },
  {
    id: 'mock-4',
    trade_id: 'TRD-MOCK-4',
    rater_id: 'mock-u4',
    rated_id: 'me',
    direction: 'buyer',
    score: 4,
    comment: 'Tutto ok, solo il rilascio ha richiesto un po’ più di tempo del previsto.',
    anonymous: false,
    submitted_at: daysAgo(9),
    rater: { nickname: 'Giulia', avatar_url: null },
  },
  {
    id: 'mock-5',
    trade_id: 'TRD-MOCK-5',
    rater_id: 'mock-u5',
    rated_id: 'me',
    direction: 'seller',
    score: 3,
    comment: 'Accettabile, comunicazione nella media.',
    anonymous: false,
    submitted_at: daysAgo(14),
    rater: { nickname: 'Luca', avatar_url: null },
  },
  {
    id: 'mock-6',
    trade_id: 'TRD-MOCK-6',
    rater_id: 'mock-u6',
    rated_id: 'me',
    direction: 'buyer',
    score: 5,
    comment: 'Excellent escrow partner — polite and pays quickly. 10/10.',
    anonymous: false,
    submitted_at: daysAgo(22),
    rater: { nickname: 'Sofia', avatar_url: null },
  },
  {
    id: 'mock-7',
    trade_id: 'TRD-MOCK-7',
    rater_id: 'mock-u7',
    rated_id: 'me',
    direction: 'seller',
    score: 2,
    comment: 'Slow replies, had to wait for the confirmation. Trade completed anyway.',
    anonymous: true,
    submitted_at: daysAgo(35),
    rater: null,
  },
  {
    id: 'mock-8',
    trade_id: 'TRD-MOCK-8',
    rater_id: 'mock-u8',
    rated_id: 'me',
    direction: 'buyer',
    score: 5,
    comment: 'Great experience from start to finish. Grazie!',
    anonymous: false,
    submitted_at: daysAgo(58),
    rater: { nickname: 'Andrea', avatar_url: null },
  },
]

/**
 * Scrollable modal listing every review for a user. Opened from the "All
 * reviews" link in the profile's Ratings & Feedback card.
 */
export function ReviewsModal({ isOpen, onClose, reviews }: Props) {
  const { t } = useTranslation()
  const all = [...reviews, ...MOCK_REVIEWS]

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
