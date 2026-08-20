import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { StarRating } from '@/components/custom/StarRating'
import { useSubmitRating } from '@/hooks/useReviews'
import { useCurrentUser } from '@/hooks/useCurrentUser'

interface ReviewFormProps {
  tradeId: string
  ratedUserId: string
  direction: 'buyer' | 'seller'
  onSubmitted?: () => void
}

export function ReviewForm({
  tradeId,
  ratedUserId,
  direction,
  onSubmitted,
}: ReviewFormProps) {
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [anonymous, setAnonymous] = useState(false)

  const { t } = useTranslation()
  const { data: currentUser } = useCurrentUser()
  const { mutateAsync: submitRating, isPending } = useSubmitRating()

  const canSubmit = score > 0 && !isPending && !!currentUser

  const handleSubmit = async () => {
    if (!canSubmit) return

    try {
      await submitRating({
        trade_id: tradeId,
        rater_id: currentUser.id,
        rated_id: ratedUserId,
        direction,
        score,
        comment: comment.trim() || null,
        anonymous,
      })

      toast.success(t('tradeDetail.ratingSubmitted'))
      setScore(0)
      setComment('')
      setAnonymous(false)
      onSubmitted?.()
    } catch (err) {
      toast.error(t('tradeDetail.ratingFailed', { message: (err as Error).message }))
    }
  }

  return (
    <Card className="glass-panel rounded-2xl p-6 mt-3">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-primary" />
          <Text variant="h4" className="font-bold">
            {t('tradeDetail.rateThisTrade')}
          </Text>
        </div>

        <Text variant="muted" className="text-sm">
          {t('tradeDetail.rateExperience', { role: direction === 'buyer' ? 'buyer' : 'seller' })}
        </Text>

        <div className="space-y-2">
          <Label className="text-base font-semibold">{t('tradeDetail.rating')}</Label>
          <StarRating value={score} onChange={setScore} size="md" />
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">{t('tradeDetail.commentOptional')}</Label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('tradeDetail.commentPlaceholder')}
            maxLength={1000}
            className="border border-border min-h-[80px] resize-none"
          />
          <p className="text-sm text-muted-foreground text-right">
            {comment.length}/1000
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="anonymous"
              size="sm"
              checked={anonymous}
              onCheckedChange={setAnonymous}
            />
            <Label htmlFor="anonymous" className="text-sm font-normal cursor-pointer">
              {t('tradeDetail.submitAnonymously')}
            </Label>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-full"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {isPending ? t('tradeDetail.submitting') : t('tradeDetail.submitRating')}
        </Button>
      </div>
    </Card>
  )
}
