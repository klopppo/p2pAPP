import type { ReactNode } from 'react'

interface OffersTableWrapperProps {
  children: ReactNode
}

export function OffersTableWrapper({ children }: OffersTableWrapperProps) {
  return (
    <div className="glass-panel rounded-2xl p-6 md:p-8 shadow-lg shadow-black/20">
      {children}
    </div>
  )
}
