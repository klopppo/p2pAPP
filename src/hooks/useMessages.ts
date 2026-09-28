import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { supabase, listMessages, sendMessage, markConversationRead } from '@/lib/supabase'
import type { MessageKind, MessageWithSender } from '@/types/database'
import { useCurrentUser } from './useCurrentUser'
import { useWalletSession } from './useWalletSession'
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic'

const MESSAGE_PAGE_SIZE = 50

// Session wallet in the key so switching/completing SIWE gets a fresh cache.
function messagesKey(conversationId: string | null | undefined, sessionWallet: string | null) {
  return ['messages', conversationId, sessionWallet] as const
}

function byTimeAsc(a: Pick<MessageWithSender, 'created_at' | 'id'>, b: Pick<MessageWithSender, 'created_at' | 'id'>) {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
}

/**
 * Paginated message list (latest 50, oldest→newest); `loadOlder()` pages
 * backward using the oldest id as cursor. Realtime subscribes to INSERTs on
 * `messages` and skips our own optimistic echoes.
 */
export function useMessages(conversationId: string | null | undefined) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const { sessionWallet, hasSession } = useWalletSession()
  const key = messagesKey(conversationId, sessionWallet)

  // Keyed so a conversation/session switch resets. Derived from the page size,
  // NOT the merged list length — `loadOlder` prepends into the same cache entry.
  const conversationKey = `${conversationId ?? ''}|${sessionWallet ?? ''}`
  const [pagination, setPagination] = useState<{ key: string; hasMore: boolean; loading: boolean }>({
    key: '',
    hasMore: false,
    loading: false,
  })
  const hasMoreOlder = pagination.key === conversationKey ? pagination.hasMore : false
  const isLoadingOlder = pagination.key === conversationKey ? pagination.loading : false
  const initializedRef = useRef<string | null>(null)
  const loadingOlderRef = useRef(false)

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const latest = await listMessages(conversationId!, { limit: MESSAGE_PAGE_SIZE })
      // A poll refetch must not drop pages accumulated by `loadOlder` (or
      // realtime inserts): merge the fresh page into the cached list.
      const cached = qc.getQueryData<MessageWithSender[]>(key)
      if (!cached?.length) return latest
      const byId = new Map(cached.map((m) => [m.id, m]))
      for (const m of latest) byId.set(m.id, m)
      return [...byId.values()].sort(byTimeAsc)
    },
    // Gate on the live session: without the JWT the RLS read returns [] silently.
    enabled: !!conversationId && hasSession,
    staleTime: 30_000,
    refetchInterval: 5_000,
  })

  useEffect(() => {
    if (!query.data || !conversationId) return
    if (initializedRef.current === conversationKey) return
    initializedRef.current = conversationKey
    setPagination({
      key: conversationKey,
      hasMore: query.data.length >= MESSAGE_PAGE_SIZE,
      loading: false,
    })
  }, [query.data, conversationId, conversationKey])

  useEffect(() => {
    if (!conversationId || !hasSession) return
    const meId = user?.id
    const liveKey = messagesKey(conversationId, sessionWallet)
    const channel = supabase
      .channel(uniqueRealtimeTopic(`messages:${conversationId}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          // Bare row (no joined `sender`), which the renderer doesn't consume.
          const incoming = payload.new as MessageWithSender
          if (meId && incoming.sender_id === meId) return // skip our own echo
          // Insert in (created_at, id) order — realtime can arrive out of order.
          qc.setQueryData<MessageWithSender[]>(liveKey, (prev) => {
            const list = prev ?? []
            if (list.some((m) => m.id === incoming.id)) return list
            const next = [...list, { ...incoming, sender: null } as unknown as MessageWithSender]
            next.sort(byTimeAsc)
            return next
          })
          qc.invalidateQueries({ queryKey: ['conversations', user?.id] })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, sessionWallet, hasSession, qc, user?.id])

  const loadOlder = useCallback(async () => {
    if (!conversationId || !hasMoreOlder || loadingOlderRef.current) return
    const list = qc.getQueryData<MessageWithSender[]>(messagesKey(conversationId, sessionWallet))
    if (!list || list.length === 0) return
    loadingOlderRef.current = true
    setPagination((p) => ({
      key: conversationKey,
      hasMore: p.key === conversationKey ? p.hasMore : false,
      loading: true,
    }))
    try {
      const older = await listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE, before: list[0].id })
      qc.setQueryData<MessageWithSender[]>(messagesKey(conversationId, sessionWallet), (prev) => {
        const current = prev ?? []
        const existing = new Set(current.map((m) => m.id))
        const fresh = older.filter((m) => !existing.has(m.id))
        return fresh.length === 0 ? prev : [...fresh, ...current]
      })
      // A short page means the start of history has been reached.
      setPagination({ key: conversationKey, hasMore: older.length >= MESSAGE_PAGE_SIZE, loading: false })
    } catch (err) {
      // Surface the failure and clear the spinner — the click site fired this
      // without awaiting, so an uncaught rejection would be invisible.
      console.warn('[useMessages] loadOlder failed:', err)
      toast.error(
        t('chat.loadOlderFailed', {
          defaultValue: 'Could not load older messages. Please try again.',
        }),
      )
      setPagination((p) => ({
        key: conversationKey,
        hasMore: p.key === conversationKey ? p.hasMore : false,
        loading: false,
      }))
    } finally {
      loadingOlderRef.current = false
    }
  }, [conversationId, sessionWallet, conversationKey, hasMoreOlder, qc, t])

  return { ...query, loadOlder, hasMore: hasMoreOlder, isLoadingOlder }
}

/** Send a message: optimistic append, rollback + localized toast on failure. */
export function useSendMessage(conversationId: string | null | undefined) {
  const { data: user } = useCurrentUser()
  const { sessionWallet, hasSession } = useWalletSession()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const tempIdRef = useRef(0)

  return useMutation({
    mutationFn: async (input: { body: string; kind?: MessageKind }) => {
      if (!user || !conversationId) throw new Error('No active conversation')
      if (!hasSession) throw new Error('No signed-in session')
      return sendMessage({ conversationId, senderId: user.id, body: input.body, kind: input.kind })
    },
    onMutate: async (input) => {
      if (!conversationId || !user || !hasSession) return
      const key = messagesKey(conversationId, sessionWallet)
      await qc.cancelQueries({ queryKey: key })
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
      qc.setQueryData<MessageWithSender[]>(key, (prev) => [...(prev ?? []), optimistic])
      return { tempId }
    },
    onError: (err, _vars, ctx) => {
      if (!conversationId || !ctx) return
      // Drop only the optimistic row: restoring a snapshot would clobber
      // realtime inserts that arrived while the send was in flight.
      qc.setQueryData<MessageWithSender[]>(messagesKey(conversationId, sessionWallet), (prev) =>
        (prev ?? []).filter((m) => m.id !== ctx.tempId),
      )
      // Loudest SIWE RLS causes: missing/invalid session (42501) and dead
      // session (401) — give the user an actionable prompt for both.
      const code = (err as { code?: string })?.code
      if ((code === '42501' || (err instanceof Error && err.message === 'No signed-in session')) && user) {
        toast.error(t('chat.signInRequired'))
      } else if (code === '401' || code === 'PGRST301') {
        toast.error(t('chat.reconnectRequired'))
      } else {
        toast.error(t('chat.sendFailed'))
      }
    },
    onSuccess: (saved, _vars, ctx) => {
      if (!conversationId || !ctx || !user) return
      // Swap temp id for the real one; filter the temp row first so a realtime
      // INSERT that slipped through the echo-skip can't leave two copies.
      qc.setQueryData<MessageWithSender[]>(messagesKey(conversationId, sessionWallet), (prev) => {
        const list = (prev ?? []).filter((m) => m.id !== ctx.tempId)
        const realId = (saved as MessageWithSender).id
        if (list.some((m) => m.id === realId)) return list
        return [...list, saved as MessageWithSender].sort(byTimeAsc)
      })
      // Best-effort read receipt; a failure must not fail the send.
      markConversationRead({ conversationId, userId: user.id, messageId: saved.id }).catch(() => {})
    },
    onSettled: () => {
      if (user) qc.invalidateQueries({ queryKey: ['conversations', user.id] })
    },
  })
}
