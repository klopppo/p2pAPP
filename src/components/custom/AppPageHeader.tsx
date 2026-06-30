import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'

interface AppPageHeaderProps {
  title: string
  subtitle?: string
  variant?: 'split' | 'centered'
  /** Action node rendered on the right (split variant only) */
  action?: React.ReactNode
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
            className="rounded-full shadow-none"
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
    <div className={`flex items-center justify-between mb-6 ${className}`}>
      <div>
        <Text variant="h3">{title}</Text>
        {subtitle && <Text variant="muted">{subtitle}</Text>}
      </div>
      {action}
    </div>
  )
}
