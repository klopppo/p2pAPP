import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import { MessageCircle } from 'lucide-react'
import { useConversations } from '@/hooks/useConversations'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { ConversationItem } from './ConversationItem'
import { createOurTeamConversation, OUR_TEAM_ID } from './ourTeam'
import { Text } from '@/components/ui/text'
import { Skeleton } from './Skeleton'

interface Props {
  activeId: string | null
  locallyReadIds: Set<string>
  onSelect: (id: string) => void
}

/**
 * The chat sidebar — full list of conversations the current user participates
 * in, sorted by last_message_at desc. Hidden on mobile when a conversation is
 * selected (the right pane takes over).
 *
 * The synthetic `ourTeam` virtual contact (welcome system thread) is
 * prepended when the user is connected — there's no DB row, just a static
 * welcome pointing to the platform Discord.
 */
export function ConversationList({ activeId, locallyReadIds, onSelect }: Props) {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const { data, isLoading, isError } = useConversations()

  const items = useMemo(() => {
    const real = data ?? []
    if (!user) return real
    const ourTeam = createOurTeamConversation(user)
    // De-dupe if a real conversation ever happens to share the ourTeam id.
    if (real.some((c) => c.id === OUR_TEAM_ID)) return real
    return [ourTeam, ...real]
  }, [data, user])

  return (
    <div className="w-[380px] flex-shrink-0 bg-muted/60 backdrop-blur-sm flex flex-col min-h-0">
      <div className="p-4 shrink-0">
        <Text variant="h4" className="font-bold">
          {t('chat.messages')}
        </Text>
        <p className="text-xs text-muted-foreground mt-1">
          Conversations from your active and past trades.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {isLoading && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        )}
        {isError && (
          <div className="p-6 text-sm text-destructive">Failed to load conversations.</div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground space-y-3">
            <MessageCircle className="w-8 h-8 mx-auto opacity-50" />
            <p>No conversations yet.</p>
            <p className="text-xs">
              Open an offer to start a chat with the trader. Conversations live next to each trade.
            </p>
          </div>
        )}
        {items.map((c) => (
          <ConversationItem
            key={c.id}
            conversation={c}
            currentUserId={user?.id ?? null}
            active={c.id === activeId}
            locallyRead={locallyReadIds.has(c.id)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
