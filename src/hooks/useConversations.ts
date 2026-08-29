import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, listConversations, getConversation, getConversationByTradeId, markConversationRead } from '@/lib/supabase'
import { useCurrentUser } from './useCurrentUser'
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic'

/**
 * All conversations the current user participates in, newest activity first.
 *
 * Wires a single Supabase Realtime channel on `conversations` only — the
 * `bump_conversation_last_message` trigger updates `last_message_at` and
 * `last_message_preview` server-side on every new message, so a per-message
 * subscription here would be wasteful (every insert in the whole `messages`
 * table would invalidate this query). Per-conversation realtime lives in
 * `useMessages` for the active chat.
 */
export function useConversations() {
  const { data: user } = useCurrentUser()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: () => listConversations(user!.id),
    enabled: !!user,
    // Poll fallback for environments without Realtime publication on
    // `conversations` (see useMessages). Realtime invalidations keep this
    // fresh when the publication is enabled.
    refetchInterval: 15_000,
  })

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(uniqueRealtimeTopic(`conversations:user:${user.id}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => qc.invalidateQueries({ queryKey: ['conversations', user.id] })
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, qc])

  return query
}

/**
 * Single conversation (by id) with participants + linked trade summary.
 * Realtime: refreshes when the conversation row itself changes.
 */
export function useConversation(conversationId: string | null | undefined) {
  const { data: user } = useCurrentUser()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['conversation', conversationId, user?.id],
    queryFn: () => getConversation(conversationId!, user!.id),
    enabled: !!conversationId && !!user,
    staleTime: 30_000,
    refetchInterval: 15_000,
  })

  useEffect(() => {
    if (!conversationId) return
    const channel = supabase
      .channel(uniqueRealtimeTopic(`conversation:${conversationId}`))
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, qc])

  return query
}

/**
 * Resolve a trade id directly to its conversation. Use right after
 * `createTrade` to redirect the user into chat.
 */
export function useConversationByTradeId(tradeId: string | null | undefined) {
  return useQuery({
    queryKey: ['conversation-by-trade', tradeId],
    queryFn: () => getConversationByTradeId(tradeId!),
    enabled: !!tradeId,
  })
}

/**
 * Mark the conversation as read up to `messageId`. Called by the chat pane
 * once messages render so the unread badge clears.
 */
export function useMarkRead(conversationId: string | null | undefined) {
  const { data: user } = useCurrentUser()
  const qc = useQueryClient()

  return useCallback(
    async (messageId: string) => {
      if (!user || !conversationId || !messageId) return
      await markConversationRead({
        conversationId,
        userId: user.id,
        messageId,
      })
      qc.invalidateQueries({ queryKey: ['conversations', user.id] })
    },
    [user, conversationId, qc]
  )
}

/**
 * Locally track which conversation is currently "open" so the sidebar can
 * hide its unread badge without waiting for the round-trip to Supabase.
 */
export function useLocallyReadConversations() {
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const mark = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])
  return { readIds, mark }
}
