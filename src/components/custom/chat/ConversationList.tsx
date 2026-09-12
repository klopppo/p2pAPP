import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Archive, ArrowLeft } from 'lucide-react'
import type { useConversations } from '@/hooks/useConversations'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { ConversationItem } from './ConversationItem'
import { createOurTeamConversation, OUR_TEAM_ID } from './ourTeam'
import { subscribeSupportChat } from '@/lib/supportChatService'
import { Text } from '@/components/ui/text'
import { Skeleton } from './Skeleton'
import { cn } from '@/lib/utils'

type ConversationView = 'active' | 'archived'

interface Props {
  activeId: string | null
  locallyReadIds: Set<string>
  onSelect: (id: string) => void
  /** Which list to render: the active inbox or the archive. */
  view: ConversationView
  onViewChange: (view: ConversationView) => void
  /**
   * The parent's `useConversations()` result for the current view. Owned by
   * the parent so the realtime channel + polling observer are created once —
   * calling the hook again here would mount a second subscription.
   */
  conversations: ReturnType<typeof useConversations>
}

/**
 * The chat sidebar — full list of conversations the current user participates
 * in, sorted by last_message_at desc. Hidden on mobile when a conversation is
 * selected (the right pane takes over).
 *
 * An "Archived" row sits at the top of the active inbox; selecting it swaps
 * the list for the archive (chats whose trade reached a terminal state).
 * Direct chats started from a profile are never archived and stay in the
 * active inbox forever.
 *
 * The synthetic `ourTeam` virtual contact (welcome system thread) is only shown
 * in the active view — there's no DB row, just a static welcome.
 */
export function ConversationList({
  activeId,
  locallyReadIds,
  onSelect,
  view,
  onViewChange,
  conversations,
}: Props) {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const { data, isLoading, isError } = conversations

  // Support-chat service keeps its own in-memory store; re-render the list
  // when an operator replies / the support thread changes.
  const [supportTick, setSupportTick] = useState(0)
  useEffect(() => {
    return subscribeSupportChat(() => {
      setSupportTick((t) => t + 1)
    })
  }, [])

  const items = useMemo(() => {
    const real = data ?? []
    if (!user || view === 'archived') return real
    const ourTeam = createOurTeamConversation(user)
    // De-dupe if a real conversation ever happens to share the ourTeam id.
    if (real.some((c) => c.id === OUR_TEAM_ID)) return real
    return [ourTeam, ...real]
    // `supportTick` isn't read directly — it forces recompute when the support
    // store changes so the ourTeam preview stays fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, user, view, supportTick])

  return (
    <div className="w-full md:w-[380px] h-full flex-shrink-0 bg-muted/60 backdrop-blur-sm flex flex-col min-h-0 overflow-hidden">
      <div className="p-4 shrink-0 flex items-center gap-2">
        {view === 'archived' && (
          <button
            type="button"
            onClick={() => onViewChange('active')}
            aria-label={t('chat.backToMessages')}
            className="rounded-full p-1.5 -ml-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <Text variant="h4" className="font-bold">
          {view === 'archived' ? t('chat.archived') : t('chat.messages')}
        </Text>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {view === 'active' && (
          <button
            type="button"
            onClick={() => onViewChange('archived')}
            className={cn(
              'w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left cursor-pointer border-b border-border/40',
            )}
          >
            <span className="h-10 w-10 shrink-0 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <Archive className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="text-sm font-semibold">{t('chat.archived')}</span>
              <span className="block text-xs text-muted-foreground truncate">
                {t('chat.archivedHint')}
              </span>
            </span>
          </button>
        )}

        {isLoading && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        )}
        {isError && (
          <div className="p-6 text-sm text-destructive">{t('chat.listError')}</div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground space-y-3">
            <MessageCircle className="w-8 h-8 mx-auto opacity-50" />
            <p>{view === 'archived' ? t('chat.archivedEmpty') : t('chat.noConversations')}</p>
            <p className="text-xs">
              {view === 'archived' ? t('chat.archivedEmptyHint') : t('chat.noConversationsHint')}
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
