import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Flag, MoreVertical, BellOff, Bell, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import type { ConversationView, ConversationWithParticipant } from '@/types/database'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TradeSummaryPill } from './TradeSummaryPill'
import { shortAddress } from '@/lib/utils'
import { ReportUserModal } from '@/components/custom/ReportUserModal'
import { setConversationMuted } from '@/lib/supabase'
import { isUserBlocked, setUserBlocked } from '@/lib/blocks'

interface Props {
  conversation: ConversationView
  currentUserId: string
  online: boolean
  onBack: () => void
  /** Called when the blocked state changes so the parent can re-render. */
  onBlockChange?: () => void
}

/**
 * Top bar of the active chat: back button (mobile), partner avatar/name, online
 * dot, a small trade summary pill linking back to the trade, and a 3-dot menu
 * with Mute / Report / Block.
 */
export function ChatHeader({ conversation, currentUserId, online, onBack, onBlockChange }: Props) {
  const { t } = useTranslation()
  const [reportOpen, setReportOpen] = useState(false)

  const other: ConversationWithParticipant | undefined = conversation.participants.find(
    (p) => p.user_id !== currentUserId
  )
  const name =
    other?.user.nickname?.trim() ||
    shortAddress(other?.user.wallet_address ?? '') ||
    'Trader'

  const reportedWallet = other?.user.wallet_address || '0x000...0000'
  const otherUserId = other?.user.id ?? ''

  const myParticipant = conversation.participants.find((p) => p.user_id === currentUserId)
  const [muted, setMuted] = useState(!!myParticipant?.muted)
  const [blocked, setBlocked] = useState(
    () => !!currentUserId && !!otherUserId && isUserBlocked(currentUserId, otherUserId),
  )

  // Partner avatar + name link to their profile. Falls back to a plain block
  // when the counterparty (and its wallet address) isn't resolved yet.
  const profileHref = other?.user.wallet_address
    ? `/app/profile/${other.user.wallet_address}`
    : null

  const handleToggleMute = async () => {
    const next = !muted
    setMuted(next)
    try {
      await setConversationMuted({ conversationId: conversation.id, userId: currentUserId, muted: next })
      toast.success(t(next ? 'chat.mutedToast' : 'chat.unmutedToast'))
    } catch {
      setMuted(!next)
      toast.error(t('chat.actionFailed'))
    }
  }

  const handleToggleBlock = async () => {
    if (!currentUserId || !otherUserId) return
    const next = !blocked
    setUserBlocked(currentUserId, otherUserId, next)
    setBlocked(next)
    // Blocking also mutes the chat so no further notifications arrive.
    if (next && !muted) {
      setMuted(true)
      try {
        await setConversationMuted({ conversationId: conversation.id, userId: currentUserId, muted: true })
      } catch {
        /* non-fatal */
      }
    }
    onBlockChange?.()
    toast.success(t(next ? 'chat.blockedToast' : 'chat.unblockedToast'))
  }

  const partnerIdentity = (
    <>
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

      <div className="min-w-0">
        <Text
          variant="small"
          className={`font-semibold truncate ${profileHref ? 'group-hover:text-primary transition-colors' : ''}`}
        >
          {name}
        </Text>
        <Text variant="muted" className="text-sm">
          {online ? t('chat.online') : t('chat.offline')}
        </Text>
      </div>
    </>
  )

  return (
    <>
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <button
          onClick={onBack}
          className="md:hidden text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {profileHref ? (
          <Link
            to={profileHref}
            aria-label={name}
            className="group flex flex-1 min-w-0 items-center gap-3 cursor-pointer"
          >
            {partnerIdentity}
          </Link>
        ) : (
          <div className="flex flex-1 min-w-0 items-center gap-3">
            {partnerIdentity}
          </div>
        )}

        {conversation.trade && (
          <Link
            to={`/app/trades/${conversation.trade.id}`}
            className="hidden sm:inline-flex"
          >
            <TradeSummaryPill trade={conversation.trade} />
          </Link>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground hover:text-foreground h-8 w-8 cursor-pointer shrink-0"
              aria-label={t('chat.moreActions')}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-2xl">
            <DropdownMenuItem onClick={() => void handleToggleMute()} className="rounded-xl cursor-pointer">
              {muted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              {muted ? t('chat.unmute') : t('chat.mute')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setReportOpen(true)} className="rounded-xl cursor-pointer">
              <Flag className="w-4 h-4" />
              {t('report.report')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void handleToggleBlock()}
              className="rounded-xl cursor-pointer text-destructive focus:text-destructive"
            >
              <Ban className="w-4 h-4" />
              {blocked ? t('chat.unblock') : t('chat.block')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ReportUserModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        reportedWallet={reportedWallet}
        tradeId={conversation.trade?.id}
        conversationId={conversation.id}
      />
    </>
  )
}
