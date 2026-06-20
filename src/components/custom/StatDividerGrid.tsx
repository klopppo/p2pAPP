import type { ReactNode } from 'react'

interface StatDividerGridProps {
  children: ReactNode
}

export function StatDividerGrid({ children }: StatDividerGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {children}
    </div>
  )
}
