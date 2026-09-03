import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import {
  useConversations,
  useConversation,
  useLocallyReadConversations,
  useMarkRead,
} from '@/hooks/useConversations'
import { useMessages, useSendMessage } from '@/hooks/useMessages'
import { useTypingIndicator, useConversationPresence } from '@/hooks/useTypingIndicator'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { ConversationList } from './ConversationList'
import { ChatHeader } from './ChatHeader'
import { MessageThread } from './MessageThread'
import { MessageComposer } from './MessageComposer'
import { TypingIndicator } from './TypingIndicator'
import { EmptyState } from './EmptyState'
import {
  createOurTeamConversation,
  OUR_TEAM_ID,
  OUR_TEAM_WELCOME,
  OUR_TEAM_DISCORD,
} from './ourTeam'
import type { ConversationView, MessageWithSender } from '@/types/database'
import { Loader2 } from 'lucide-react'

interface Props {
  /**
   * Optional fixed conversation id (e.g. the chat embedded inside a trade
   * detail view). When omitted, the route param `:conversationId` is used,
   * falling back to the most recent conversation.
   */
  conversationId?: string
  onBack?: () => void
}

/**
 * Two-pane chat shell. Wires together all chat hooks (conversations, messages,
 * typing, presence) and renders either the conversation list + active
 * conversation, or an empty state.
 *
 * The `ourTeam` virtual conversation (synthetic welcome pointing at the
 * platform Discord) is handled inline — there's no DB row, so the
 * conversation query never returns, and the composer is hidden (no thread
 * to send to).
 *
 * Layout matches the original ChatPage exactly:
 *   - desktop: fixed 380px sidebar + flex-1 chat pane
 *   - mobile:  when a chat is open, sidebar hides; back button shows in header
 */
export function ChatLayout({ conversationId: forcedId, onBack }: Props) {
  const navigate = useNavigate()
  const { conversationId: routeId } = useParams<{ conversationId: string }>()
  const { data: user, isLoading: userLoading } = useCurrentUser()
  const conversations = useConversations()
  const { readIds, mark } = useLocallyReadConversations()

  // Pinned id (user clicked a conversation) overrides the route / fallback.
  // We keep it in state so a subsequent conversations refresh can't suddenly
  // switch the active pane away from the one the user is reading.
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  const fallbackId = conversations.data?.[0]?.id ?? null
  const activeId = forcedId ?? routeId ?? pinnedId ?? fallbackId

  // Skip the DB hooks entirely for the synthetic ourTeam thread — no
  // rows to read.
  const isOurTeam = activeId === OUR_TEAM_ID

  const convQuery = useConversation(isOurTeam ? null : activeId)
  const messages = useMessages(isOurTeam ? null : activeId)
  const send = useSendMessage(isOurTeam ? null : activeId)
  const markRead = useMarkRead(isOurTeam ? null : activeId)
  const identity = useMemo(
    () => (user ? { userId: user.id, nickname: user.nickname } : null),
    [user?.id, user?.nickname],
  )
  const typing = useTypingIndicator(isOurTeam ? null : activeId, identity)
  const online = useConversationPresence(isOurTeam ? null : activeId, identity)

  const partner = useMemo(() => {
    if (!user) return null
    if (isOurTeam) return null
    const conv = convQuery.data
    if (!conv) return null
    return conv.participants.find((p) => p.user_id !== user.id) ?? null
  }, [convQuery.data, user, isOurTeam])

  const partnerOnline = !!partner && online.some((o) => o.user_id === partner.user_id)

  // Synthetic conversation (for ChatHeader) + synthetic messages for the
  // ourTeam thread. Computed every render but cheap — no DB read.
  const ourTeamConv: ConversationView | null = user ? createOurTeamConversation(user) : null
  const ourTeamMessages = useMemo<MessageWithSender[]>(() => {
    if (!isOurTeam || !user) return []
    const now = new Date().toISOString()
    const senderId = '00000000-0000-0000-0000-000000000000' // sentinel id
    return [
      {
        id: 'ourTeam-welcome',
        conversation_id: OUR_TEAM_ID,
        sender_id: senderId,
        body: OUR_TEAM_WELCOME,
        kind: 'system',
        created_at: now,
        sender: {
          id: senderId,
          wallet_address: '',
          nickname: 'ourTeam',
          avatar_url: null,
          verification_level: 'trusted',
        },
      },
    ]
  }, [isOurTeam, user])

  // Once messages render, mark the conversation read so the badge clears.
  // Skip the synthetic ourTeam thread — there's no DB row to mark.
  const lastMarkedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeId || !user || isOurTeam) return
    if (!messages.data || messages.data.length === 0) return
    const last = messages.data[messages.data.length - 1]
    if (!last) return
    // Skip the optimistic temp-* ids from `useSendMessage.onMutate` —
    // writing them to `last_read_message_id` makes the unread-count
    // query fall back to the 1970-01-01 timestamp and spike the badge
    // until onSuccess swaps the real id in. Once the swap happens the
    // effect re-runs and we mark the real id.
    if (last.id.startsWith('temp-')) return
    mark(activeId)
    if (lastMarkedRef.current !== last.id) {
      lastMarkedRef.current = last.id
      void markRead(last.id).catch((err) => { console.warn('[ChatLayout.tsx]', err); return undefined })
    }
  }, [activeId, user, messages.data, mark, markRead, isOurTeam])

  const [draft, setDraft] = useState('')

  const handleSend = () => {
    const body = draft.trim()
    if (!body || isOurTeam) return
    send.mutate({ body })
    setDraft('')
  }

  const handleBack = () => {
    setPinnedId(null)
    if (onBack) {
      onBack()
      return
    }
    if (forcedId) navigate('/app/messages')
  }

  const handleSelect = (id: string) => {
    setPinnedId(id)
    if (forcedId) navigate(`/app/messages/${id}`)
  }

  if (userLoading) {
    return (
      <section className="flex-1 flex items-center justify-center p-8 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting…
      </section>
    )
  }

  if (!user) {
    return (
      <section className="flex-1 flex items-center justify-center p-8 text-muted-foreground text-sm">
        Connect a wallet to view your conversations.
      </section>
    )
  }

  const noConversations =
    !!conversations.data && conversations.data.length === 0 && !isOurTeam
  const showSidebar = !activeId || !forcedId

  return (
    <section className="flex-1 flex flex-col min-h-0 -mb-8">
      <div className="flex flex-1 min-h-0">
        {showSidebar && (
          <div className={activeId ? 'hidden md:block' : 'w-full md:w-auto'}>
            <ConversationList
              activeId={activeId}
              locallyReadIds={readIds}
              onSelect={handleSelect}
            />
          </div>
        )}

        {activeId ? (
          isOurTeam && ourTeamConv ? (
            <OurTeamPane messages={ourTeamMessages} onBack={handleBack} />
          ) : convQuery.isLoading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading conversation…
            </div>
          ) : !convQuery.data ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Conversation not found.
            </div>
          ) : (
    <div className="flex-1 bg-background/20 px-6 pt-6 pb-3 flex flex-col min-h-0">
              <ChatHeader
                conversation={convQuery.data}
                currentUserId={user.id}
                online={partnerOnline}
                onBack={handleBack}
              />
              <MessageThread
                messages={messages.data ?? []}
                currentUserId={user.id}
                partnerAvatarUrl={partner?.user.avatar_url ?? null}
                partnerInitial={
                  partner?.user.nickname?.trim() ||
                  partner?.user.wallet_address?.slice(0, 2) ||
                  '??'
                }
                loading={messages.isLoading}
                hasMore={!!messages.hasMore}
                onLoadOlder={messages.loadOlder}
              />
              {typing.typingUsers.length > 0 && (
                <TypingIndicator nickname={typing.typingUsers[0].nickname} />
              )}
              <MessageComposer
                value={draft}
                onChange={setDraft}
                onSend={handleSend}
                onTyping={typing.notifyTyping}
                onStopTyping={typing.notifyStopTyping}
                disabled={convQuery.data.status === 'locked' || send.isPending}
                placeholder={
                  convQuery.data.status === 'locked'
                    ? 'This conversation is locked.'
                    : 'Type a message…'
                }
              />
            </div>
          )
        ) : (
          <div className="hidden md:flex flex-1">
            <EmptyState noConversations={noConversations} />
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Right pane for the synthetic ourTeam thread. Renders the welcome
 * message + a Discord link, hides the composer (no DB row to send to),
 * and disables the typing indicator.
 */
function OurTeamPane({
  messages,
  onBack,
}: {
  messages: MessageWithSender[]
  onBack: () => void
}) {
  const { data: user } = useCurrentUser()
  const headerBack = (
    <button
      type="button"
      onClick={onBack}
      className="md:hidden text-muted-foreground hover:text-foreground text-sm"
    >
      ← Back
    </button>
  )
  return (
    <div className="flex-1 bg-background/20 px-6 pt-6 pb-3 flex flex-col min-h-0">
      {/* Inline minimal header so the welcome thread reads correctly. */}
      <div className="flex items-center gap-3 pb-3 border-b border-border/40">
        {headerBack}
        <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <MessageCircle className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">ourTeam</p>
          <p className="text-xs text-muted-foreground">CofferNode support</p>
        </div>
      </div>

      <MessageThread
        messages={messages}
        currentUserId={user?.id ?? ''}
        partnerAvatarUrl={null}
        partnerInitial="OT"
        loading={false}
        onLoadOlder={() => undefined}
      />

      <div className="pt-4 border-t border-border/50 flex flex-wrap gap-2">
        <a
          href={OUR_TEAM_DISCORD}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
        >
          Open Discord
        </a>
        <span className="text-xs text-muted-foreground self-center">
          Live community support — Discord is the fastest channel.
        </span>
      </div>
    </div>
  )
}
