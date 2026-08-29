import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, listMessages, sendMessage, markConversationRead } from '@/lib/supabase'
import type { MessageKind, MessageWithSender } from '@/types/database'
import { useCurrentUser } from './useCurrentUser'

/**
 * Paginated message list for a conversation. Initial load is the latest 50
 * (oldest→newest); `loadOlder()` pages backward using the oldest id as a
 * cursor.
 *
 * Realtime: subscribes to `INSERT`s on `messages` filtered by conversation_id
 * so the active chat receives new messages without polling. We additionally
 * skip our own echoes (handled optimistically by `useSendMessage.onMutate`)
 * to avoid rendering our own message twice.
 */
export function useMessages(conversationId: string | null | undefined) {
  const qc = useQueryClient()
  const { data: user } = useCurrentUser()

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => listMessages(conversationId!, { limit: 50 }),
    enabled: !!conversationId,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!conversationId) return
    const meId = user?.id
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          // Supabase `postgres_changes` does not deliver joined relations,
          // so `payload.new` is a bare `messages` row — `sender` is undefined.
          // The MessageBubble renderer doesn't actually consume
          // `message.sender` (it uses the partner avatar from props), so
          // null is safe. Cast to the broader shape for the cache update.
          const incoming = payload.new as MessageWithSender
          // Skip our own echoes — the optimistic insert in `useSendMessage`
          // already added this row under a `temp-*` id, and `onSuccess`
          // swaps the temp id for the real one. Appending here would
          // render the message twice on slow networks where realtime
          // arrives before onSuccess.
          if (meId && incoming.sender_id === meId) {
            return
          }
          // Server-side join arrives as a bare row — synthesise the sender
          // shape from current cache if needed (we'll refresh on next mutation).
          qc.setQueryData<MessageWithSender[]>(['messages', conversationId], (prev) => {
            const list = prev ?? []
            if (list.some((m) => m.id === incoming.id)) return list
            return [
              ...list,
              {
                ...incoming,
                sender: null,
              } as MessageWithSender,
            ]
          })
          qc.invalidateQueries({ queryKey: ['conversations'] })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, qc, user?.id])

  const loadOlder = async () => {
    if (!conversationId) return
    const list = qc.getQueryData<MessageWithSender[]>(['messages', conversationId])
    if (!list || list.length === 0) return
    const oldest = list[0]
    const older = await listMessages(conversationId, { limit: 50, before: oldest.id })
    qc.setQueryData<MessageWithSender[]>(['messages', conversationId], (prev) => [
      ...older,
      ...(prev ?? []),
    ])
  }

  const hasMore = (query.data?.length ?? 0) >= 50

  return { ...query, loadOlder, hasMore }
}

/**
 * Mutation: send a message. Optimistically appends to the message list and
 * rolls back on failure.
 */
export function useSendMessage(conversationId: string | null | undefined) {
  const { data: user } = useCurrentUser()
  const qc = useQueryClient()
  const tempIdRef = useRef(0)

  return useMutation({
    mutationFn: async (input: { body: string; kind?: MessageKind }) => {
      if (!user || !conversationId) throw new Error('No active conversation')
      return sendMessage({
        conversationId,
        senderId: user.id,
        body: input.body,
        kind: input.kind,
      })
    },
    onMutate: async (input) => {
      if (!conversationId || !user) return
      const key = ['messages', conversationId]
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<MessageWithSender[]>(key) ?? []
      const tempId = `temp-${Date.now()}-${++tempIdRef.current}`
      const optimistic: MessageWithSender = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        body: input.body,
        kind: input.kind ?? 'text',
        created_at: new Date().toISOString(),
        sender: {
          id: user.id,
          wallet_address: user.wallet_address,
          nickname: user.nickname,
          avatar_url: user.avatar_url,
          verification_level: user.verification_level,
        },
      }
      qc.setQueryData<MessageWithSender[]>(key, [...previous, optimistic])
      return { previous, tempId }
    },
    onError: (_err, _vars, ctx) => {
      if (!conversationId || !ctx) return
      qc.setQueryData(['messages', conversationId], ctx.previous)
    },
    onSuccess: (saved, _vars, ctx) => {
      if (!conversationId || !ctx) return
      const key = ['messages', conversationId]
      // Swap the optimistic temp-* id for the real one. Filter out the
      // temp row first (not just by id) so a realtime INSERT that slipped
      // through the meId-skip path can't leave two copies behind.
      qc.setQueryData<MessageWithSender[]>(key, (prev) => {
        const list = (prev ?? []).filter((m) => m.id !== ctx.tempId)
        const realId = (saved as MessageWithSender).id
        if (list.some((m) => m.id === realId)) return list
        return [...list, saved as MessageWithSender]
      })
      // Fire-and-forget: mark this message as read for the sender.
      markConversationRead({
        conversationId,
        userId: user!.id,
        messageId: saved.id,
      }).catch(() => {
        // non-fatal
      })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}
