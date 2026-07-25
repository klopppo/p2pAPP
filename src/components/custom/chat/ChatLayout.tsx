import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { Loader2 } from 'lucide-react'
import { matchCommand, type ChatCommand } from '@/lib/chat/commands'

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

  const convQuery = useConversation(activeId)
  const messages = useMessages(activeId)
  const send = useSendMessage(activeId)
  const markRead = useMarkRead(activeId)
  const identity = useMemo(
    () => (user ? { userId: user.id, nickname: user.nickname } : null),
    [user]
  )
  const typing = useTypingIndicator(activeId, identity)
  const online = useConversationPresence(activeId, identity)

  const partner = useMemo(() => {
    const conv = convQuery.data
    if (!conv || !user) return null
    return conv.participants.find((p) => p.user_id !== user.id) ?? null
  }, [convQuery.data, user])

  const partnerOnline = !!partner && online.some((o) => o.user_id === partner.user_id)

  // Track last-read message id to avoid redundant markRead calls.
  const lastReadIdRef = useRef<string | null>(null)

  // Once messages render, mark the conversation read so the badge clears.
  useEffect(() => {
    if (!activeId || !user || !messages.data || messages.data.length === 0) return
    const last = messages.data[messages.data.length - 1]
    if (!last || last.id === lastReadIdRef.current) return
    lastReadIdRef.current = last.id
    mark(activeId)
    markRead(last.id)
  }, [activeId, user, messages.data, mark, markRead])

  const [draft, setDraft] = useState('')

  const handleCommand = useCallback(
    (cmd: ChatCommand) => {
      const result = cmd.execute({
        conversation: convQuery.data ?? null,
        currentUserId: user.id,
      })
      if (result.kind === 'message') {
        send.mutate(
          { body: result.body, kind: 'system' },
          { onSettled: () => setDraft('') }
        )
      } else if (result.kind === 'navigate') {
        navigate(result.path)
      }
      setDraft('')
    },
    [convQuery.data, user, send, navigate]
  )

  const handleSend = useCallback(() => {
    const body = draft.trim()
    if (!body) return
    // Check if the input is a slash command
    const cmd = matchCommand(body)
    if (cmd) {
      handleCommand(cmd)
      setDraft('')
      return
    }
    send.mutate(
      { body },
      {
        onError: () => {},
        onSettled: () => setDraft(''),
      }
    )
  }, [draft, send, handleCommand])

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

  const noConversations = !!conversations.data && conversations.data.length === 0
  const showSidebar = !activeId || !forcedId

  return (
    <section className="flex-1 flex flex-col min-h-0 -mb-8">
      <div className="flex flex-1 min-h-0">
        {showSidebar && (
          <div className={activeId ? 'hidden md:block' : 'w-full md:w-auto'}>
            <ConversationList
              activeId={activeId}
              locallyReadIds={readIds}
              conversations={conversations.data}
              isLoading={conversations.isLoading}
              isError={conversations.isError}
              onSelect={handleSelect}
            />
          </div>
        )}

        {activeId ? (
          convQuery.isLoading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading conversation…
            </div>
          ) : !convQuery.data ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Conversation not found.
            </div>
          ) : (
            <div className="flex-1 bg-background/20 p-4 flex flex-col min-h-0">
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
                hasMore={messages.hasMore}
                onLoadOlder={messages.loadOlder}
              />
              {typing.typingUsers.length > 0 && (
                <TypingIndicator nickname={typing.typingUsers[0].nickname} />
              )}
              <MessageComposer
                value={draft}
                onChange={setDraft}
                onSend={handleSend}
                onCommand={handleCommand}
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
