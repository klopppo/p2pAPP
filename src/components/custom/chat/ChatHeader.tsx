import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ConversationView, ConversationWithParticipant } from '@/types/database'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { TradeSummaryPill } from './TradeSummaryPill'
import { shortAddress } from '@/lib/utils'
import { ReportUserModal } from '@/components/custom/ReportUserModal'

interface Props {
  conversation: ConversationView
  currentUserId: string
  online: boolean
  onBack: () => void
}

/**
 * Top bar of the active chat: back button (mobile), partner avatar/name, online
 * dot, report button, and a small trade summary pill linking back to the trade.
 */
export function ChatHeader({ conversation, currentUserId, online, onBack }: Props) {
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

  // Partner avatar + name link to their profile. Falls back to a plain block
  // when the counterparty (and its wallet address) isn't resolved yet.
  const profileHref = other?.user.wallet_address
    ? `/app/profile/${other.user.wallet_address}`
    : null

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

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setReportOpen(true)}
          className="rounded-full text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1 px-2.5 h-8 cursor-pointer"
          title={t('report.reportUserOrChat')}
          aria-label={t('report.reportUserOrChat')}
        >
          <ShieldAlert className="w-4 h-4" />
          <span className="hidden sm:inline">{t('report.report')}</span>
        </Button>
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

