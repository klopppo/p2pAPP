import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface TypingUser {
  user_id: string
  nickname: string | null
}

/**
 * Typing indicator broadcast over a Supabase Realtime `broadcast` channel
 * scoped to the conversation. We use broadcast (not postgres_changes)
 * because typing pings are ephemeral and should never hit the DB.
 *
 * Usage:
 *   const { typingUsers, notifyTyping } = useTypingIndicator(conversationId, { userId, nickname })
 *
 * The returned `notifyTyping` is debounced internally — call it freely from
 * the input's onChange.
 */
export function useTypingIndicator(
  conversationId: string | null | undefined,
  identity: { userId: string; nickname: string | null } | null
) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSentRef = useRef(0)

  useEffect(() => {
    if (!conversationId) return

    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: identity?.userId ?? 'anon' } },
    })

    channel
      .on('broadcast', { event: 'typing' }, (msg: { payload: unknown }) => {
        const payload = msg.payload as TypingUser & { ts?: number }
        if (!payload?.user_id || payload.user_id === identity?.userId) return
        setTypingUsers((prev) => {
          const others = prev.filter((u) => u.user_id !== payload.user_id)
          return [...others, { user_id: payload.user_id, nickname: payload.nickname ?? null }]
        })
      })
      .on('broadcast', { event: 'stop_typing' }, (msg: { payload: unknown }) => {
        const payload = msg.payload as { user_id: string }
        if (!payload?.user_id || payload.user_id === identity?.userId) return
        setTypingUsers((prev) => prev.filter((u) => u.user_id !== payload.user_id))
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      setTypingUsers([])
    }
  }, [conversationId, identity?.userId])

  // Auto-clear stale typing entries after 4s of silence per user.
  useEffect(() => {
    if (typingUsers.length === 0) return
    const timers = typingUsers.map((u) =>
      setTimeout(() => {
        setTypingUsers((prev) => prev.filter((p) => p.user_id !== u.user_id))
      }, 4000)
    )
    return () => timers.forEach(clearTimeout)
  }, [typingUsers])

  const notifyTyping = useCallback(() => {
    if (!channelRef.current || !identity) return
    const now = Date.now()
    // Throttle to one broadcast per 1.5s so we don't spam the channel.
    if (now - lastSentRef.current < 1500) return
    lastSentRef.current = now
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: identity.userId, nickname: identity.nickname, ts: now },
    })
  }, [identity])

  const notifyStopTyping = useCallback(() => {
    if (!channelRef.current || !identity) return
    channelRef.current.send({
      type: 'broadcast',
      event: 'stop_typing',
      payload: { user_id: identity.userId },
    })
  }, [identity])

  return { typingUsers, notifyTyping, notifyStopTyping }
}

interface PresenceUser {
  user_id: string
  nickname: string | null
  online_at: string
}

/**
 * Online presence for the participants of a conversation. Driven by the
 * presence channel attached to the broadcast channel above.
 */
export function useConversationPresence(
  conversationId: string | null | undefined,
  identity: { userId: string; nickname: string | null } | null
) {
  const [online, setOnline] = useState<PresenceUser[]>([])

  useEffect(() => {
    if (!conversationId || !identity) return

    const channel = supabase.channel(`presence:${conversationId}`, {
      config: { presence: { key: identity.userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>()
        const list: PresenceUser[] = []
        Object.values(state).forEach((entries) => {
          (entries as PresenceUser[]).forEach((p) => list.push(p))
        })
        setOnline(list)
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: identity.userId,
            nickname: identity.nickname,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      supabase.removeChannel(channel)
      setOnline([])
    }
  }, [conversationId, identity])

  return online
}
