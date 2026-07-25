import { useMemo } from 'react'
import type { ConversationView, ConversationWithParticipant } from '@/types/database'
import { cn, shortAddress } from '@/lib/utils'

interface Props {
  conversation: ConversationView
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
export function ConversationItem({ conversation, active, locallyRead, onSelect }: Props) {
  const other: ConversationWithParticipant | undefined = useMemo(() => {
    const me = conversation.participants[0]
    return conversation.participants.find((p) => p.user_id !== me?.user_id)
  }, [conversation.participants])

  const name = other?.user.nickname?.trim() || shortAddress(other?.user.wallet_address ?? '')
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
      <Avatar name={name} avatarUrl={other?.user.avatar_url ?? null} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold truncate">{name}</span>
          {time && <span className="text-xs text-muted-foreground shrink-0">{time}</span>}
        </div>
        <p className="text-sm text-muted-foreground truncate">{preview}</p>
      </div>
      {showUnread && (
        <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0">
          {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
        </span>
      )}
    </button>
  )
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
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
