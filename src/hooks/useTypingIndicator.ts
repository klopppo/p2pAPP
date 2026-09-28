import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface TypingUser {
  user_id: string
  nickname: string | null
}

/**
 * Typing indicator over a Supabase Realtime `broadcast` channel (ephemeral, so
 * it never hits the DB). `notifyTyping` is throttled to one ping per 1.5s;
 * entries auto-clear after 4s per user. A final `stop_typing` is broadcast on
 * unmount so the partner's badge clears immediately.
 */
export function useTypingIndicator(
  conversationId: string | null | undefined,
  identity: { userId: string; nickname: string | null } | null
) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSentRef = useRef(0)
  const isTypingRef = useRef(false)
  const lastSeenRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!conversationId) return
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: identity?.userId ?? 'anon' } },
    })

    channel
      .on('broadcast', { event: 'typing' }, (msg: { payload: unknown }) => {
        const payload = msg.payload as TypingUser & { ts?: number }
        if (!payload?.user_id || payload.user_id === identity?.userId) return
        setTypingUsers((prev) => [
          ...prev.filter((u) => u.user_id !== payload.user_id),
          { user_id: payload.user_id, nickname: payload.nickname ?? null },
        ])
        // Stamp last-seen so the rolling 4s timer resets on every keystroke.
        if (typeof payload.ts === 'number') lastSeenRef.current.set(payload.user_id, payload.ts)
      })
      .on('broadcast', { event: 'stop_typing' }, (msg: { payload: unknown }) => {
        const payload = msg.payload as { user_id: string }
        if (!payload?.user_id || payload.user_id === identity?.userId) return
        setTypingUsers((prev) => prev.filter((u) => u.user_id !== payload.user_id))
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      // Best-effort final stop_typing; swallow sync throws and async
      // rejections if the channel is already gone.
      if (isTypingRef.current && identity?.userId) {
        try {
          const p = channel.send({ type: 'broadcast', event: 'stop_typing', payload: { user_id: identity.userId } })
          if (p && typeof (p as Promise<unknown>).catch === 'function') (p as Promise<unknown>).catch(() => {})
        } catch {
          // sync throw — handled
        }
      }
      supabase.removeChannel(channel)
      channelRef.current = null
      setTypingUsers([])
      isTypingRef.current = false
    }
  }, [conversationId, identity])

  // Seed timestamps for users we haven't stamped yet.
  useEffect(() => {
    const now = Date.now()
    for (const u of typingUsers) {
      if (!lastSeenRef.current.has(u.user_id)) lastSeenRef.current.set(u.user_id, now)
    }
  }, [typingUsers])

  // Single 1s ticker while anyone is typing; expiries are per-user.
  const isTypingActive = typingUsers.length > 0
  useEffect(() => {
    if (!isTypingActive) return
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - 4000
      setTypingUsers((prev) => {
        let changed = false
        const filtered = prev.filter((u) => {
          if ((lastSeenRef.current.get(u.user_id) ?? 0) < cutoff) {
            changed = true
            return false
          }
          return true
        })
        return changed ? filtered : prev
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isTypingActive])

  const notifyTyping = useCallback(() => {
    if (!channelRef.current || !identity) return
    const now = Date.now()
    if (now - lastSentRef.current < 1500) return
    lastSentRef.current = now
    isTypingRef.current = true
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: identity.userId, nickname: identity.nickname, ts: now },
    })
  }, [identity])

  const notifyStopTyping = useCallback(() => {
    if (!channelRef.current || !identity) return
    isTypingRef.current = false
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
 * Online presence for the participants of a conversation. Re-baselines from
 * the full presence state on sync AND leave (a wallet open in two tabs tracks
 * two entries under one key, so per-user subtraction would be wrong).
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

    const syncFromState = () => {
      const state = channel.presenceState<PresenceUser>()
      const list: PresenceUser[] = []
      Object.values(state).forEach((entries) => {
        ;(entries as PresenceUser[]).forEach((p) => list.push(p))
      })
      setOnline(list)
    }

    channel
      .on('presence', { event: 'sync' }, syncFromState)
      .on('presence', { event: 'leave' }, syncFromState)
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
