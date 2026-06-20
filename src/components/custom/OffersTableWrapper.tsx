interface OffersTableWrapperProps {
  children: React.ReactNode
}

export function OffersTableWrapper({ children }: OffersTableWrapperProps) {
  return (
    <div className="bg-card border border-x border-t border-border rounded-t-2xl rounded-b-none border-b-0 overflow-hidden shadow-none">
      {children}
    </div>
  )
}
