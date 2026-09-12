import { useMemo } from 'react'
import type { ConversationView, ConversationWithParticipant } from '@/types/database'
import { cn, shortTradeId } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface Props {
  conversation: ConversationView
  currentUserId: string | null | undefined
  active: boolean
  locallyRead?: boolean
  onSelect: (id: string) => void
}

/**
 * One row in the chat sidebar.
 *
 * Shows the other party's avatar + nickname + last message preview and an
 * unread badge. Uses `bg-primary` for the badge to match the existing chat
 * visual language.
 */
export function ConversationItem({
  conversation,
  currentUserId,
  active,
  locallyRead,
  onSelect,
}: Props) {
  const other: ConversationWithParticipant | undefined = useMemo(() => {
    // PostgREST doesn't guarantee participant ordering. Filter by the
    // explicit currentUserId from props so the sidebar consistently
    // shows the counterparty regardless of which row comes back first.
    if (!currentUserId) return conversation.participants[1]
    return conversation.participants.find((p) => p.user_id !== currentUserId)
  }, [conversation.participants, currentUserId])

  const isOurTeam = conversation.id === 'ourTeam'
  const name = isOurTeam
    ? 'ourTeam'
    : (other?.user.nickname?.trim() || shortAddress(other?.user.wallet_address ?? ''))
  const preview = conversation.last_message_preview ?? 'Trade opened — say hi'
  const time = conversation.last_message_at
    ? new Date(conversation.last_message_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  const showUnread = !locallyRead && conversation.unread_count > 0

  return (
    <button
      onClick={() => onSelect(conversation.id)}
      className={cn(
        'w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left cursor-pointer',
        active && 'bg-muted/50'
      )}
    >
      <Avatar name={name} avatarUrl={other?.user.avatar_url ?? null} isOurTeam={isOurTeam} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold truncate">{name}</span>
          {time && <span className="text-xs text-muted-foreground shrink-0">{time}</span>}
        </div>
        {/* Trade tag: only trade-anchored chats have a linked trade. */}
        {conversation.trade && (
          <div className="mt-0.5">
            <Badge
              variant="outline"
              className="rounded-full px-1.5 py-0 text-[10px] font-mono text-muted-foreground"
            >
              {shortTradeId(conversation.trade.trade_id)}
            </Badge>
          </div>
        )}
        <p className="text-sm text-muted-foreground truncate">{preview}</p>
      </div>
      {showUnread && (
        <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0 font-medium">
          {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
        </span>
      )}
    </button>
  )
}

function shortAddress(addr: string): string {
  if (!addr) return 'Unknown'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function Avatar({ name, avatarUrl, isOurTeam }: { name: string; avatarUrl: string | null; isOurTeam?: boolean }) {
  if (isOurTeam) {
    return (
      <div className="relative shrink-0">
        <div className="h-10 w-10 rounded-full bg-primary/15 text-primary overflow-hidden flex items-center justify-center font-bold text-xs">
          OT
        </div>
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full ring-2 ring-card" />
      </div>
    )
  }

  const initials = name.slice(0, 2).toUpperCase() || '??'
  return (
    <div className="relative shrink-0">
      <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex items-center justify-center">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-medium text-muted-foreground">{initials}</span>
        )}
      </div>
    </div>
  )
}
