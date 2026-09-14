import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'

interface AppPageHeaderProps {
  title: string
  subtitle?: ReactNode
  variant?: 'split' | 'centered'
  /** Action node rendered on the right (split variant only) */
  action?: ReactNode
  /** Back handler (centered variant) */
  onBack?: () => void
  className?: string
}

export function AppPageHeader({
  title,
  subtitle,
  variant = 'split',
  action,
  onBack,
  className = '',
}: AppPageHeaderProps) {
  if (variant === 'centered') {
    return (
      <div className={`relative flex items-center mb-8 ${className}`}>
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="rounded-full shadow-none shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <div className="absolute left-1/2 -translate-x-1/2 text-center w-full px-14 pointer-events-none">
          <Text variant="h3" className="leading-tight">{title}</Text>
          {subtitle && (
            <Text variant="small" className="text-muted-foreground">{subtitle}</Text>
          )}
        </div>
      </div>
    )
  }

  // split variant — title left, action right
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 mb-6 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <Text variant="h3" className="truncate">{title}</Text>
          {subtitle && <Text variant="muted" className="truncate">{subtitle}</Text>}
        </div>
      </div>
      {action}
    </div>
  )
}
