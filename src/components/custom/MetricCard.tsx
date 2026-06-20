import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string
  change?: string
  isPositive?: boolean
}

export function MetricCard({ label, value, change, isPositive }: MetricCardProps) {
  return (
    <Card className="p-4 bg-card border-border rounded-2xl shadow-none">
      <div className="text-sm text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono mb-2">{value}</div>
      {change && (
        <div className="flex items-center text-sm">
          {isPositive ? (
            <TrendingUp className="h-4 w-4 mr-1 text-[#22c55e]" />
          ) : (
            <TrendingDown className="h-4 w-4 mr-1 text-[#ef4444]" />
          )}
          <span className={isPositive ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
            {change}
          </span>
        </div>
      )}
    </Card>
  )
}
