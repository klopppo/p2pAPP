import type { ReactNode } from 'react'

interface OffersTableWrapperProps {
  children: ReactNode
}

export function OffersTableWrapper({ children }: OffersTableWrapperProps) {
  // No padding: the table fills the card edge-to-edge, and `overflow-hidden`
  // clips the header row to the card's rounded corners.
  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {children}
    </div>
  )
}
