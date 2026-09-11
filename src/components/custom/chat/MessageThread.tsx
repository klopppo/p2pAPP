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
  /** True while an older page is in flight — disables the loader button so a
   *  double-click can't fire two identical cursor requests. */
  loadingOlder?: boolean
  onLoadOlder: () => void
}

/**
 * Auto-scrolling message list. Pins to the bottom when a NEW message arrives
 * and offers an "older" loader at the top for paginated history (only when
 * hasMore is true).
 */
export function MessageThread({
  messages,
  currentUserId,
  partnerAvatarUrl,
  partnerInitial,
  loading,
  hasMore = false,
  loadingOlder = false,
  onLoadOlder,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Track the newest message id: only a change there means something new
  // arrived. Using `messages.length` instead would also fire when history is
  // prepended by `loadOlder()`, yanking the user to the bottom mid-read.
  const lastIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    if (!last) return
    if (lastIdRef.current === last.id) return
    lastIdRef.current = last.id
    // Scroll the container (not the page). `scrollTop = scrollHeight`
    // pins to the bottom without involving `scrollIntoView`, which
    // would walk up the ancestor chain and could end up scrolling
    // <html> when the parent chain doesn't strictly clip us.
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 no-scrollbar"
    >
      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={loadingOlder}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1 rounded-full border border-border/50 hover:bg-muted/40 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
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
