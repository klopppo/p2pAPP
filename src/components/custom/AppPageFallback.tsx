import { cn } from '@/lib/utils'

function bar({ className }: { className?: string }) {
  return <div className={cn('rounded-full bg-muted/60 animate-pulse', className)} />
}

function card({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'bg-background/50 backdrop-blur-xl border border-border/50 rounded-2xl p-6',
        className,
      )}
    >
      <div className="space-y-3">
        {bar({ className: 'h-3 w-24' })}
        {bar({ className: 'h-4 w-3/4' })}
        {bar({ className: 'h-3 w-1/2' })}
      </div>
    </div>
  )
}

/**
 * Skeleton shown while a lazily-imported route chunk loads. Rendered inside
 * the active layout so the navbar stays mounted and content appears to
 * stream in. Uses design tokens only (bg-muted / border-border) with a
 * subtle pulse; sets aria-busy so SRs announce the pending state.
 */
export function AppPageFallback() {
  return (
    <section className="space-y-8" role="status" aria-busy="true" aria-label="Loading">
      <header className="space-y-3">
        {bar({ className: 'h-1.5 w-24' })}
        {bar({ className: 'h-6 w-48' })}
        {bar({ className: 'h-3 w-64 max-w-full' })}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {card({ className: 'md:col-span-2' })}
        {card({})}
        {card({})}
      </div>
      {card({})}
    </section>
  )
}