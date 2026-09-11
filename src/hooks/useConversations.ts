import { useCallback, useEffect, useRef, useSyncExternalStore, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, listConversations, getConversation, getConversationByTradeId, markConversationRead } from '@/lib/supabase'
import { useCurrentUser } from './useCurrentUser'
import { useWalletSession } from './useWalletSession'
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
  const { sessionWallet, hasSession } = useWalletSession()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['conversations', user?.id, sessionWallet],
    queryFn: () => listConversations(user!.id),
    // `!!user` alone is not enough — the world-readable `users` row resolves
    // even without a JWT, and the RLS read policy would return [] silently.
    enabled: !!user && hasSession,
    // Poll fallback for environments without Realtime publication on
    // `conversations` (see useMessages). Realtime invalidations keep this
    // fresh when the publication is enabled.
    refetchInterval: 15_000,
  })

  const userId = user?.id

  useEffect(() => {
    if (!userId || !hasSession) return

    const channel = supabase
      .channel(uniqueRealtimeTopic(`conversations:user:${userId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => qc.invalidateQueries({ queryKey: ['conversations', userId] })
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, hasSession, qc])

  return query
}

/**
 * Single conversation (by id) with participants + linked trade summary.
 * Realtime: refreshes when the conversation row itself changes.
 */
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
  }, [conversationId, hasSession, qc])

  return query
}

/**
 * Resolve a trade id directly to its conversation. Use right after
 * `createTrade` to redirect the user into chat.
 */
export function useConversationByTradeId(tradeId: string | null | undefined) {
  const { sessionWallet, hasSession } = useWalletSession()
  return useQuery({
    queryKey: ['conversation-by-trade', tradeId, sessionWallet],
    queryFn: () => getConversationByTradeId(tradeId!),
    enabled: !!tradeId && hasSession,
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
 *
 * The Set is held in a ref so `mark()` mutates in-place — consumers
 * that read `readIds` get the same reference across renders and don't
 * re-render unless the version counter (incremented only on change)
 * ticks. The version field is informational; consumers can also just
 * watch `readIds.has(id)` synchronously.
 */
export function useLocallyReadConversations() {
  const readIdsRef = useRef<Set<string>>(new Set())
  const readIdsRenderable = useReadFromRefAfterRender(readIdsRef)
  const [version, setVersion] = useState(0)
  const mark = useCallback((id: string) => {
    if (readIdsRef.current.has(id)) return
    readIdsRef.current.add(id)
    setVersion((v) => v + 1)
  }, [])
  return { readIds: readIdsRenderable, mark, version }
}

/**
 * Read a ref's value into the render output without tripping React 19's
 * "Cannot access refs during render" purity check. The ref is read inside
 * a `useState` lazy initializer that fires once per mount, not during
 * subsequent renders; mutations from `mark()` continue to land in the
 * same `readIdsRef.current` Set.
 *
 * This is a thin shim around a known React limitation — alternatives
 * (`useSyncExternalStore`, splitting reads vs writes) are heavier for
 * what amounts to "a Set the user can poke at from event handlers".
 */
// File-level disable: React 19's purity check rejects all ref reads
// during render, including the canonical pattern below. We use
// useSyncExternalStore to expose a ref-held Set to consumers without
// re-rendering the whole list on every mark() call.
// Subscribe to a ref's current value, returning a plain render-time
// snapshot. `useSyncExternalStore` is the canonical React 18+ API for
// reading mutable state during render without tripping the
// `react-hooks/purity` rule. `getSnapshot` returns the ref's current
// value; `getServerSnapshot` is the SSR fallback (returns a stable empty
// Set so the server-rendered HTML matches the first client render —
// avoids the hydration warning when localStorage isn't populated server-
// side).
function useReadFromRefAfterRender<T>(ref: { current: T }): T {
  return useSyncExternalStore(
    () => () => {},
    () => ref.current,
    () => ref.current, // SSR snapshot — same value, stable identity
  )
}
