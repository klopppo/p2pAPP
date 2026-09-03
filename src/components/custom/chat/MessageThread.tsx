import { useEffect, useRef } from 'react'
import type { MessageWithSender } from '@/types/database'
import { MessageBubble } from './MessageBubble'
import { Loader2 } from 'lucide-react'

interface Props {
  messages: MessageWithSender[]
  currentUserId: string
  partnerAvatarUrl: string | null
  partnerInitial: string
  loading: boolean
  /** When true, show the "Load older messages" button at the top. False when
   *  the conversation has fewer than the page size (50) messages or the
   *  page-back call has already returned a short batch. */
  hasMore?: boolean
  onLoadOlder: () => void
}

/**
 * Auto-scrolling message list. Always pins to the bottom when the message
 * count changes (new send or realtime arrival) and offers an "older" loader
 * at the top for paginated history (only when hasMore is true).
 */
export function MessageThread({
  messages,
  currentUserId,
  partnerAvatarUrl,
  partnerInitial,
  loading,
  hasMore = false,
  onLoadOlder,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(messages.length)

  useEffect(() => {
    if (messages.length === 0) return
    // Only auto-scroll when something new arrived.
    if (messages.length === prevCountRef.current) return
    prevCountRef.current = messages.length
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto space-y-4 min-h-0 no-scrollbar">
      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadOlder}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1 rounded-full border border-border/50 hover:bg-muted/40 transition-colors cursor-pointer"
          >
            Load older messages
          </button>
        </div>
      )}

      {loading && messages.length === 0 && (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading messages…
        </div>
      )}

      {!loading && messages.length === 0 && (
        <div className="text-center py-16 text-sm text-muted-foreground">
          <p>No messages yet.</p>
          <p className="text-xs mt-1">Send the first message to break the ice.</p>
        </div>
      )}

      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          isOwn={m.sender_id === currentUserId}
          partnerAvatarUrl={partnerAvatarUrl}
          partnerInitial={partnerInitial}
        />
      ))}
      <div ref={endRef} />
    </div>
  )
}
