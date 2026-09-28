import { Loader2 } from 'lucide-react'

interface Props {
  /** i18n key suffix — typically `chat.loadingConversation` or similar. */
  label?: string
  /** Larger variant for full-pane loading. */
  size?: 'sm' | 'md' | 'lg'
}

/** Centered chat loading indicator; sizes cover inline and full-pane states. */
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
