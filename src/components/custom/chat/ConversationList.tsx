import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import type { useConversations } from '@/hooks/useConversations'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { ConversationItem } from './ConversationItem'
import { createOurTeamConversation, OUR_TEAM_ID } from './ourTeam'
import { subscribeSupportChat } from '@/lib/supportChatService'
import { Text } from '@/components/ui/text'
import { Skeleton } from './Skeleton'

interface Props {
  activeId: string | null
  locallyReadIds: Set<string>
  onSelect: (id: string) => void
  /**
   * The parent's `useConversations()` result. Owned by the parent so the
   * realtime channel + polling observer are created once — calling the hook
   * again here would mount a second subscription for the same table.
   */
  conversations: ReturnType<typeof useConversations>
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
export function ConversationList({ activeId, locallyReadIds, onSelect, conversations }: Props) {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const { data, isLoading, isError } = conversations
  const [supportTick, setSupportTick] = useState(0)

  useEffect(() => {
    return subscribeSupportChat(() => {
      setSupportTick((t) => t + 1)
    })
  }, [])

  const items = useMemo(() => {
    const real = data ?? []
    if (!user) return real
    const ourTeam = createOurTeamConversation(user)
    // De-dupe if a real conversation ever happens to share the ourTeam id.
    if (real.some((c) => c.id === OUR_TEAM_ID)) return real
    return [ourTeam, ...real]
  }, [data, user, supportTick])

  return (
    <div className="w-full md:w-[380px] h-full flex-shrink-0 bg-muted/60 backdrop-blur-sm flex flex-col min-h-0">
      <div className="p-4 shrink-0">
        <Text variant="h4" className="font-bold">
          {t('chat.messages')}
        </Text>
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
