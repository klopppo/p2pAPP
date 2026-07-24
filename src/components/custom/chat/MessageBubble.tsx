import type { MessageWithSender } from '@/types/database'
import { cn } from '@/lib/utils'

interface Props {
  message: MessageWithSender
  isOwn: boolean
  partnerAvatarUrl: string | null
  partnerInitial: string
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Single chat bubble. Own messages right-aligned with the lime primary fill,
 * incoming left-aligned with muted background. Avatars only render for the
 * incoming side (matches the original ChatPage visual).
 */
export function MessageBubble({ message, isOwn, partnerAvatarUrl, partnerInitial }: Props) {
  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      {!isOwn && (
        <div className="h-8 w-8 mr-2 mt-1 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
          {partnerAvatarUrl ? (
            <img src={partnerAvatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-medium text-muted-foreground">
              {partnerInitial.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col max-w-[70%]">
        {message.kind === 'system' ? (
          <div className="px-3 py-1.5 rounded-full bg-muted/60 border border-border/40 text-xs text-muted-foreground text-center">
            {message.body}
          </div>
        ) : (
          <div
            className={cn(
              'px-4 py-2 rounded-2xl text-sm',
              isOwn
                ? 'bg-primary text-primary-foreground rounded-tr-none'
                : 'bg-muted text-foreground rounded-tl-none'
            )}
          >
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          </div>
        )}
        <span
          className={cn(
            'text-xs text-muted-foreground mt-1',
            isOwn ? 'text-right' : 'text-left'
          )}
        >
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  )
}
