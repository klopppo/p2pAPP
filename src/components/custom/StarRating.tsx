import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  size?: 'sm' | 'md'
  readonly?: boolean
}

const SIZE_MAP = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
}

export function StarRating({
  value,
  onChange,
  size = 'md',
  readonly = false,
}: StarRatingProps) {
  const [hovered, setHovered] = useState(0)

  const interactive = !readonly && !!onChange
  const display = interactive && hovered > 0 ? hovered : value

  return (
    <div
      className="inline-flex items-center gap-0.5"
      onMouseLeave={() => interactive && setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          className={cn(
            'p-0 border-0 bg-transparent',
            interactive && 'cursor-pointer hover:scale-110 transition-transform',
            readonly && 'cursor-default',
          )}
          onMouseEnter={() => interactive && setHovered(star)}
          onClick={() => interactive && onChange!(star)}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
        >
          <Star
            className={cn(
              SIZE_MAP[size],
              star <= display
                ? 'fill-primary text-primary'
                : 'fill-none text-muted-foreground/30',
              'transition-colors',
            )}
          />
        </button>
      ))}
    </div>
  )
}
