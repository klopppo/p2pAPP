import { Loader2 } from 'lucide-react'

interface Props {
  /** i18n key suffix — typically `chat.loadingConversation` or similar. */
  label?: string
  /** Larger variant for full-pane loading. */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Centered loading indicator used by the chat layout. Lives in the middle
 * of the right pane (or full page) while conversations / messages / dispute
 * detail data are still hydrating. Three sizes so the same component
 * works for small inline states and full-pane gating.
 */
export function ChatLoading({ label = 'Loading…', size = 'md' }: Props) {
  const dims =
    size === 'lg'
      ? 'h-10 w-10'
      : size === 'sm'
        ? 'h-4 w-4'
        : 'h-6 w-6'
  const spacing =
    size === 'lg'
      ? 'flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm py-12'
      : size === 'sm'
        ? 'flex items-center gap-2 text-muted-foreground text-xs'
        : 'flex-1 flex items-center justify-center gap-3 text-muted-foreground text-sm'
  return (
    <div className={spacing} role="status" aria-live="polite">
      <Loader2 className={`${dims} animate-spin`} />
      {size !== 'sm' && <span>{label}</span>}
    </div>
  )
}
