import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string
  change?: string
  isPositive?: boolean
  children?: ReactNode
}

export function MetricCard({ label, value, change, isPositive, children }: MetricCardProps) {
  return (
    <Card className="p-6 bg-card/50 border-border rounded-2xl shadow-none hover:border-primary/30 transition-colors">
      <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="text-4xl font-bold font-mono mb-3">{value}</div>
      {change && (
        <div className="flex items-center text-sm font-semibold">
          {isPositive ? (
            <TrendingUp className="h-4 w-4 mr-2 text-success" />
          ) : (
            <TrendingDown className="h-4 w-4 mr-2 text-danger" />
          )}
          <span className={isPositive ? 'text-success' : 'text-danger'}>
            {change}
          </span>
        </div>
      )}
      {children}
    </Card>
  )
}
