interface StatDividerGridProps {
  children: React.ReactNode[]
}

export function StatDividerGrid({ children }: StatDividerGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border bg-transparent border-0 rounded-none">
      {children.map((child, index) => (
        <div key={index} className="bg-transparent border-0">
          {child}
        </div>
      ))}
    </div>
  )
}
