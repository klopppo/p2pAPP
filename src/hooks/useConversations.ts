import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, listConversations, getConversation, getConversationByTradeId, markConversationRead } from '@/lib/supabase'
import { useCurrentUser } from './useCurrentUser'
import { useWalletSession } from './useWalletSession'
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic'
import { subscribeShared } from './realtimeChannel'

/**
 * Conversations for the current user, newest activity first.
 * `archived`: undefined = all, false = active, true = archive.
 * Realtime listens on `conversations` only — the DB trigger updates the
 * last-message columns, so per-message subscriptions here would be wasteful.
 */
export function useConversations(options: { archived?: boolean; enabled?: boolean } = {}) {
  const { archived, enabled = true } = options
  const { data: user } = useCurrentUser()
  const { sessionWallet, hasSession } = useWalletSession()
  const qc = useQueryClient()
  const viewKey = archived === undefined ? 'all' : archived ? 'archived' : 'active'

  const query = useQuery({
    queryKey: ['conversations', user?.id, sessionWallet, viewKey],
    queryFn: () => listConversations(user!.id, { archived }),
    // Gate on the live session: without the JWT the RLS read returns [] silently.
    enabled: !!user && hasSession && enabled,
    refetchInterval: 15_000,
  })

  const userId = user?.id

  useEffect(() => {
    if (!userId || !hasSession || !enabled) return
    // Per-user topic (not per view): the active + archived lists share a single
    // channel instead of double-subscribing to the same table events.
    return subscribeShared(
      `conversations:user:${userId}`,
      { schema: 'public', table: 'conversations' },
      () => qc.invalidateQueries({ queryKey: ['conversations', userId] }),
    )
  }, [userId, hasSession, enabled, qc])

  return query
}

/** Single conversation (participants + linked trade) with realtime refresh. */
export function useConversation(conversationId: string | null | undefined) {
  const { data: user } = useCurrentUser()
  const { sessionWallet, hasSession } = useWalletSession()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['conversation', conversationId, user?.id, sessionWallet],
    queryFn: () => getConversation(conversationId!, user!.id),
    enabled: !!conversationId && !!user && hasSession,
    staleTime: 30_000,
    refetchInterval: 15_000,
  })

  useEffect(() => {
    if (!conversationId || !hasSession) return
    const channel = supabase
      .channel(uniqueRealtimeTopic(`conversation:${conversationId}`))
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, hasSession, qc])

  return query
}

/** Resolve a trade id to its conversation (used right after createTrade). */
export function useConversationByTradeId(tradeId: string | null | undefined) {
  const { sessionWallet, hasSession } = useWalletSession()
  return useQuery({
    queryKey: ['conversation-by-trade', tradeId, sessionWallet],
    queryFn: () => getConversationByTradeId(tradeId!),
    enabled: !!tradeId && hasSession,
  })
}

/** Mark the conversation as read up to `messageId`. */
export function useMarkRead(conversationId: string | null | undefined) {
  const { data: user } = useCurrentUser()
  const qc = useQueryClient()
  return useCallback(
    async (messageId: string) => {
      if (!user || !conversationId || !messageId) return
      await markConversationRead({ conversationId, userId: user.id, messageId })
      qc.invalidateQueries({ queryKey: ['conversations', user.id] })
    },
    [user, conversationId, qc]
  )
}

/**
 * Locally track which conversation is open so the sidebar can hide its unread
 * badge before the round-trip.
 */
export function useLocallyReadConversations() {
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set())
  const mark = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])
  return { readIds, mark }
}
