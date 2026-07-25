import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ConversationView, ConversationWithParticipant } from '@/types/database'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { shortAddress } from '@/lib/utils'
import { TradeSummaryPill } from './TradeSummaryPill'

interface Props {
  conversation: ConversationView
  currentUserId: string
  online: boolean
  onBack: () => void
}

/**
 * Top bar of the active chat: back button (mobile), partner avatar/name, online
 * dot, and a small trade summary pill linking back to the trade.
 */
export function ChatHeader({ conversation, currentUserId, online, onBack }: Props) {
  const other: ConversationWithParticipant | undefined = conversation.participants.find(
    (p) => p.user_id !== currentUserId
  )
  const name =
    other?.user.nickname?.trim() ||
    shortAddress(other?.user.wallet_address ?? '') ||
    'Trader'

  return (
    <div className="flex items-center gap-3 mb-4 shrink-0">
      <button
        onClick={onBack}
        className="md:hidden text-muted-foreground hover:text-foreground cursor-pointer"
        aria-label="Back to conversations"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      <div className="relative">
        <Avatar className="h-10 w-10">
          {other?.user.avatar_url ? (
            <AvatarImage src={other.user.avatar_url} alt={name} />
          ) : null}
          <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
            online ? 'bg-green-500' : 'bg-muted-foreground/40'
          }`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <Text variant="small" className="font-semibold truncate">
          {name}
        </Text>
        <Text variant="muted" className="text-sm">
          {online ? 'Online' : 'Offline'}
        </Text>
      </div>

      {conversation.trade && (
        <Link
          to={`/app/trade/${conversation.trade.trade_id}`}
          className="hidden sm:inline-flex"
        >
          <TradeSummaryPill trade={conversation.trade} />
        </Link>
      )}
    </div>
  )
}

