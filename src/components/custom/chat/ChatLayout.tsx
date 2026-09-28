import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
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
import { isUserBlocked } from '@/lib/blocks'
import { useIsDesktop } from '@/hooks/useMediaQuery'
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
 * Two-pane chat shell: conversation list + active thread. The synthetic
 * `ourTeam` thread is handled inline (no DB row, composer hidden).
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
  // Always loaded so we know whether to surface the "Archived" row at all.
  const archivedConversations = useConversations({ archived: true })
  const hasArchived = (archivedConversations.data?.length ?? 0) > 0
  const conversations = showArchived ? archivedConversations : activeConversations
  const { readIds, mark } = useLocallyReadConversations()

  // Pinned id (user clicked a conversation) overrides the route / fallback.
  // We keep it in state so a subsequent conversations refresh can't suddenly
  // switch the active pane away from the one the user is reading.
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  // Route param wins: reset the pinned id when it (or the forced prop) changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinnedId(null)
  }, [routeId, forcedId])

  // Only the active inbox drives auto-selection, and never on mobile.
  const isDesktop = useIsDesktop()
  const fallbackId = isDesktop ? (activeConversations.data?.[0]?.id ?? null) : null
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

  // Device-local block state. Toggling it in the header bumps a reducer so
  // this re-renders and re-reads the block list for the composer.
  const [, bumpBlockTick] = useReducer((n: number) => n + 1, 0)
  const partnerBlocked = !!(
    user &&
    partner?.user_id &&
    isUserBlocked(user.id, partner.user_id)
  )

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
    // Skip optimistic temp-* ids: they aren't valid UUIDs, so writing them
    // makes the unread-count query spike until onSuccess swaps the real id in.
    if (last.id.startsWith('temp-')) return
    mark(activeId)
    if (lastMarkedRef.current !== last.id) {
      lastMarkedRef.current = last.id
      void markRead(last.id).catch((err) => { console.warn('[ChatLayout.tsx]', err); return undefined })
    }
  }, [activeId, user, messages.data, mark, markRead, isOurTeam])

  // Viewing heartbeat (60s) so the notify trigger skips recipients who are
  // already looking at the thread; cleared on unmount / chat switch.
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

  // Opening a chat clears its unread notifications; the `messages` dep catches
  // any that slipped in before the viewing heartbeat landed.
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
    // A conversation must actually be open — a stray tap on the list view
    // (which renders no back button anyway) should be a no-op.
    if (!activeId) return
    // Always return to the list view — this also clears the `:conversationId`
    // route param, which is what the mobile back button needs.
    navigate('/app/messages')
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

  // No live session: RLS reads return an empty array, not an error, so show an
  // explicit sign-in prompt instead of a misleading "conversation not found".
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

  // The right pane can't pick an empty state until the conversation list resolves.
  if (activeConversations.isLoading && !isOurTeam && !forcedId) {
    return (
      <section className="flex-1 flex items-center justify-center p-8">
        <ChatLoading size="lg" label={t('chat.loading')} />
      </section>
    )
  }

  return (
    // Height chain from AppLayout's `h-[100dvh]`: every pane is `min-h-0` so
    // only the intended child scrolls — the document itself never does.
    <section className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex flex-1 min-h-0 rounded-l-2xl overflow-hidden">
        {showSidebar && (
          <div className={activeId ? 'hidden md:flex md:min-h-0' : 'w-full md:w-auto'}>
            <ConversationList
              activeId={activeId}
              locallyReadIds={readIds}
              onSelect={handleSelect}
              view={showArchived ? 'archived' : 'active'}
              onViewChange={(v) => setShowArchived(v === 'archived')}
              hasArchived={hasArchived}
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
                key={convQuery.data.id}
                conversation={convQuery.data}
                currentUserId={user.id}
                online={partnerOnline}
                onBack={handleBack}
                onBlockChange={() => bumpBlockTick()}
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
                  partnerBlocked ||
                  send.isPending
                }
                placeholder={
                  convQuery.data.status === 'locked'
                    ? t('chat.lockedPlaceholder')
                    : convQuery.data.status === 'archived'
                      ? t('chat.archivedPlaceholder')
                      : partnerBlocked
                        ? t('chat.blockedPlaceholder')
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

/** Right pane for the ourTeam thread: support messages + operator replies. */
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
