import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'


import {
  useConversations,
  useConversation,
  useLocallyReadConversations,
  useMarkRead,
} from '@/hooks/useConversations'
import { useMessages, useSendMessage } from '@/hooks/useMessages'
import { useTypingIndicator, useConversationPresence } from '@/hooks/useTypingIndicator'
import { useGlobalPresence } from '@/hooks/useGlobalPresence'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useWalletSession } from '@/hooks/useWalletSession'
import {
  markConversationNotificationsRead,
  setConversationViewing,
} from '@/lib/supabase'
import {
  getOurTeamMessagesForUser,
  sendUserOurTeamMessage,
  markThreadReadByUser,
  subscribeSupportChat,
  type SupportMessage,
} from '@/lib/supportChatService'
import { ConversationList } from './ConversationList'
import { ChatHeader } from './ChatHeader'
import { MessageThread } from './MessageThread'
import { MessageComposer } from './MessageComposer'
import { TypingIndicator } from './TypingIndicator'
import { EmptyState } from './EmptyState'
import { ChatLoading } from './ChatLoading'
import {
  createOurTeamConversation,
  OUR_TEAM_ID,
  OUR_TEAM_DISCORD,
} from './ourTeam'
import type { ConversationView, MessageWithSender } from '@/types/database'

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
  const { hasSession, isLoading: sessionLoading } = useWalletSession()
  const { t } = useTranslation()
  const qc = useQueryClient()
  // Active inbox vs archive. The archive query is deferred until the view is
  // opened so it doesn't add a subscription for every chat session.
  const [showArchived, setShowArchived] = useState(false)
  const activeConversations = useConversations({ archived: false })
  const archivedConversations = useConversations({ archived: true, enabled: showArchived })
  const conversations = showArchived ? archivedConversations : activeConversations
  const { readIds, mark } = useLocallyReadConversations()

  // Pinned id (user clicked a conversation) overrides the route / fallback.
  // We keep it in state so a subsequent conversations refresh can't suddenly
  // switch the active pane away from the one the user is reading.
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  // Reset the pinned id whenever the route param changes (or the forced
  // prop changes) — the route param always wins. The reset is a single
  // conditional setState inside an effect; the React Compiler / lint rule
  // flags synchronous setState in an effect body, but this is the canonical
  // pattern for "reset derived state on prop change" (the alternative is
  // a separate useEffect for the comparison-and-reset, which is heavier).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinnedId(null)
  }, [routeId, forcedId])

  // Only the ACTIVE inbox drives the default selection — opening /app/messages
  // must not auto-open the most recently archived chat.
  const fallbackId = activeConversations.data?.[0]?.id ?? null
  const activeId = forcedId ?? pinnedId ?? routeId ?? fallbackId

  // Skip the DB hooks entirely for the synthetic ourTeam thread — no
  // rows to read.
  const isOurTeam = activeId === OUR_TEAM_ID

  const convQuery = useConversation(isOurTeam ? null : activeId)
  const messages = useMessages(isOurTeam ? null : activeId)
  const send = useSendMessage(isOurTeam ? null : activeId)
  const markRead = useMarkRead(isOurTeam ? null : activeId)
  const identity = useMemo(
    () => (user ? { userId: user.id, nickname: user.nickname } : null),
    [user],
  )
  const typing = useTypingIndicator(isOurTeam ? null : activeId, identity)
  const online = useConversationPresence(isOurTeam ? null : activeId, identity)
  const onlineUsers = useGlobalPresence()

  const partner = useMemo(() => {
    if (!user) return null
    if (isOurTeam) return null
    const conv = convQuery.data
    if (!conv) return null
    return conv.participants.find((p) => p.user_id !== user.id) ?? null
  }, [convQuery.data, user, isOurTeam])

  const partnerOnline =
    !!partner &&
    (onlineUsers.has(partner.user_id) || online.some((o) => o.user_id === partner.user_id))

  // Synthetic conversation for the ourTeam thread.
  const ourTeamConv: ConversationView | null = user ? createOurTeamConversation(user) : null

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

  // Tell the server this conversation is being viewed (heartbeat, refreshed
  // every 60s). The `notify_conversation_message` trigger skips recipients
  // whose `viewing_at` is recent, so a message landing in the open pane never
  // creates a notification / email. Cleared on unmount / chat switch.
  useEffect(() => {
    if (!activeId || !user || isOurTeam) return
    const conversationId = activeId
    const userId = user.id
    const ping = () => {
      void setConversationViewing({ conversationId, userId, viewing: true })
    }
    ping()
    const interval = window.setInterval(ping, 60_000)
    return () => {
      window.clearInterval(interval)
      void setConversationViewing({ conversationId, userId, viewing: false })
    }
  }, [activeId, user, isOurTeam])

  // Opening a chat clears that thread's unread notifications (and any that
  // slipped in on the race before the viewing heartbeat landed, hence the
  // `messages.data?.length` dep).
  useEffect(() => {
    if (!activeId || !user || isOurTeam) return
    void markConversationNotificationsRead({
      conversationId: activeId,
      userId: user.id,
    })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['notifications', user.id] })
        void qc.invalidateQueries({ queryKey: ['notifications:unread', user.id] })
      })
      .catch((err) => {
        console.warn('[ChatLayout] mark conversation notifications read failed:', err)
      })
  }, [activeId, user, isOurTeam, messages.data?.length, qc])

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
    if (!forcedId) {
      navigate(`/app/messages/${id}`)
    }
  }

  if (userLoading) {
    return (
      <section className="flex-1 flex items-center justify-center p-8">
        <ChatLoading size="lg" label={t('chat.connecting')} />
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

  // Wait for the session probe to settle before deciding. `useWalletSession`
  // polls, so this is a real (brief) state, not a permanent gate.
  if (sessionLoading) {
    return (
      <section className="flex-1 flex items-center justify-center p-8">
        <ChatLoading size="lg" label={t('chat.connecting')} />
      </section>
    )
  }

  // Wallet connected but no live Supabase session. The RLS reads would be
  // denied and come back as an empty array (no error), so render an explicit
  // sign-in prompt rather than a misleading "conversation not found". The
  // SignInPrompt overlay offers the button that fixes this.
  if (!hasSession) {
    return (
      <section className="flex-1 flex items-center justify-center p-8 text-muted-foreground text-sm text-center">
        {t('chat.signInToView')}
      </section>
    )
  }

  const noConversations =
    !!activeConversations.data && activeConversations.data.length === 0 && !isOurTeam
  const showSidebar = !activeId || !forcedId

  // Page-level loading state. Until the conversation list resolves we don't
  // know if there's an active conversation, so the right pane can't show
  // a meaningful empty state. Render a centered spinner across the full
  // chat area to make the hydration visible.
  if (activeConversations.isLoading && !isOurTeam && !forcedId) {
    return (
      <section className="flex-1 flex items-center justify-center p-8">
        <ChatLoading size="lg" label={t('chat.loading')} />
      </section>
    )
  }

  return (
    // Height chain: AppLayout gives the chat route a definite `h-[100dvh]`
    // shell (navbar shrink-0, main flex-1 min-h-0, no footer), PageContainer
    // is `flex-1 min-h-0` with zero padding, and this section fills it. From
    // here every pane is `min-h-0` so only the intended child (ConversationList
    // / MessageThread) gets its own `overflow-y-auto` — the document never
    // scrolls.
    <section className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex flex-1 min-h-0">
        {showSidebar && (
          <div className={activeId ? 'hidden md:flex md:min-h-0' : 'w-full md:w-auto'}>
            <ConversationList
              activeId={activeId}
              locallyReadIds={readIds}
              onSelect={handleSelect}
              view={showArchived ? 'archived' : 'active'}
              onViewChange={(v) => setShowArchived(v === 'archived')}
              conversations={conversations}
            />
          </div>
        )}

        {activeId ? (
          isOurTeam && ourTeamConv ? (
            <OurTeamPane onBack={handleBack} />
          ) : convQuery.isLoading ? (
            <ChatLoading size="lg" label={t('chat.loadingConversation')} />
          ) : !convQuery.data ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              {t('chat.conversationNotFound')}
            </div>
          ) : (
    <div className="flex-1 bg-background/20 px-6 pt-6 pb-3 flex flex-col min-h-0 overflow-hidden">
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
                loadingOlder={messages.isLoadingOlder}
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
                disabled={
                  convQuery.data.status === 'locked' ||
                  convQuery.data.status === 'archived' ||
                  send.isPending
                }
                placeholder={
                  convQuery.data.status === 'locked'
                    ? t('chat.lockedPlaceholder')
                    : convQuery.data.status === 'archived'
                      ? t('chat.archivedPlaceholder')
                      : t('chat.typeMessage')
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
 * Right pane for the ourTeam thread.
 * Renders support messages, live operator responses, and allows the user
 * to send messages to the operator team while keeping the Discord community link accessible.
 */
function OurTeamPane({
  onBack,
}: {
  onBack: () => void
}) {
  const { data: user } = useCurrentUser()
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)

  const refreshMessages = useCallback(() => {
    if (!user) return
    const msgs = getOurTeamMessagesForUser(user)
    setSupportMessages(msgs)
    markThreadReadByUser(user.id)
  }, [user])

  useEffect(() => {
    refreshMessages()
    const unsubscribe = subscribeSupportChat(refreshMessages)
    return () => unsubscribe()
  }, [refreshMessages])

  const mappedMessages = useMemo<MessageWithSender[]>(() => {
    if (!user) return []
    return supportMessages.map((m) => {
      const isMe = m.sender_type === 'user'
      const senderId = isMe ? user.id : '00000000-0000-0000-0000-000000000000'
      return {
        id: m.id,
        conversation_id: OUR_TEAM_ID,
        sender_id: senderId,
        body: m.body,
        kind: m.sender_type === 'system' ? 'system' : 'text',
        created_at: m.created_at,
        sender: {
          id: senderId,
          wallet_address: isMe ? user.wallet_address || '' : '',
          nickname: isMe ? user.nickname || 'You' : m.sender_name,
          avatar_url: isMe ? user.avatar_url || null : null,
          verification_level: isMe ? user.verification_level || 'unverified' : 'trusted',
        },
      }
    })
  }, [supportMessages, user])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || !user || isSending) return
    setIsSending(true)
    try {
      await sendUserOurTeamMessage(user, text)
      setDraft('')
      refreshMessages()
    } catch (err) {
      console.warn('[OurTeamPane] send message failed:', err)
      toast.error('Impossibile inviare il messaggio di supporto.')
    } finally {
      setIsSending(false)
    }
  }

  const headerBack = (
    <button
      type="button"
      onClick={onBack}
      className="md:hidden text-muted-foreground hover:text-foreground text-sm cursor-pointer"
    >
      ← Back
    </button>
  )

  return (
    <div className="flex-1 bg-background/20 px-6 pt-6 pb-3 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-3">
          {headerBack}
          <div className="relative">
            <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 font-bold text-xs">
              OT
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full ring-2 ring-card" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold">ourTeam</p>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/20 text-primary">
                Operatori Attivi
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Supporto Diretto CofferNode</p>
          </div>
        </div>

        <a
          href={OUR_TEAM_DISCORD}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
        >
          <span>Discord Live</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Community notice banner */}
      <div className="my-2 p-2.5 rounded-xl bg-card/60 border border-border/40 flex items-center justify-between gap-2 text-xs text-muted-foreground shrink-0">
        <span>
          💬 Scrivi qui sotto: un nostro operatore ti risponderà in questa chat.
        </span>
        <a
          href={OUR_TEAM_DISCORD}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium shrink-0"
        >
          Community Discord →
        </a>
      </div>

      <MessageThread
        messages={mappedMessages}
        currentUserId={user?.id ?? ''}
        partnerAvatarUrl={null}
        partnerInitial="OT"
        loading={false}
        onLoadOlder={() => undefined}
      />

      <MessageComposer
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onTyping={() => undefined}
        onStopTyping={() => undefined}
        disabled={isSending}
        placeholder="Scrivi un messaggio a ourTeam..."
      />
    </div>
  )
}
