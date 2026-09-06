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
 *
 * On unmount (component swap, conversation switch, page nav) we fire a
 * final `stop_typing` broadcast so the partner doesn't see "Alice is
 * typing…" stuck on for the full 4-second auto-clear window.
 */
export function useTypingIndicator(
  conversationId: string | null | undefined,
  identity: { userId: string; nickname: string | null } | null
) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSentRef = useRef(0)
  const isTypingRef = useRef(false)

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
        // Stamp the per-user last-seen so the rolling 4s timer in the
        // sync effect actually rolls — without this, the sync effect
        // reconstructs the map from `typingUsers` but the timestamp we
        // stored was the FIRST ping's, so the badge would clear after 4s
        // and flicker back on the next broadcast.
        if (typeof payload.ts === 'number') {
          lastSeenRef.current.set(payload.user_id, payload.ts)
        }
      })
      .on('broadcast', { event: 'stop_typing' }, (msg: { payload: unknown }) => {
        const payload = msg.payload as { user_id: string }
        if (!payload?.user_id || payload.user_id === identity?.userId) return
        setTypingUsers((prev) => prev.filter((u) => u.user_id !== payload.user_id))
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      // Fire a final stop_typing so the partner's "Alice is typing…" badge
      // clears immediately when the user switches chats or leaves the
      // page. Best-effort — fire-and-forget. Swallow BOTH sync throws
      // and async rejections so we don't generate an unhandled rejection
      // if the channel has already been torn down.
      if (isTypingRef.current && identity?.userId) {
        try {
          const sendPromise = channel.send({
            type: 'broadcast',
            event: 'stop_typing',
            payload: { user_id: identity.userId },
          })
          if (
            sendPromise &&
            typeof (sendPromise as Promise<unknown>).catch === 'function'
          ) {
            ;(sendPromise as Promise<unknown>).catch(() => {})
          }
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

  // Auto-clear stale typing entries after 4s of silence PER USER. Track
  // the last-received timestamp per user in a ref so each user's expiry
  // is independent — a new `typing` event for Alice resets *only* Alice's
  // timer, not Bob's. The effect runs a single ticker so we don't
  // accumulate setTimeouts on every broadcast.
  const lastSeenRef = useRef<Map<string, number>>(new Map())
  // Roll the per-user timestamp forward on every `typingUsers` change.
  // The broadcast handler also writes to this map directly (see
  // above) so the user actually gets a fresh timer on each keystroke.
  useEffect(() => {
    const now = Date.now()
    for (const u of typingUsers) {
      if (!lastSeenRef.current.has(u.user_id)) {
        lastSeenRef.current.set(u.user_id, now)
      }
    }
  }, [typingUsers])

  useEffect(() => {
    if (typingUsers.length === 0) return
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - 4000
      setTypingUsers((prev) => {
        let changed = false
        const filtered = prev.filter((u) => {
          const last = lastSeenRef.current.get(u.user_id) ?? 0
          if (last < cutoff) {
            changed = true
            return false
          }
          return true
        })
        return changed ? filtered : prev
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [typingUsers.length === 0])

  const notifyTyping = useCallback(() => {
    if (!channelRef.current || !identity) return
    const now = Date.now()
    // Throttle to one broadcast per 1.5s so we don't spam the channel.
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
 * Online presence for the participants of a conversation. Driven by a
 * Supabase Realtime presence channel scoped to the conversation id.
 *
 * Subscribes to three presence events so the green dot / typing indicator
 * never sticks when a partner disconnects:
 *   - 'sync'    : full state dump from the server (re-baseline)
 *   - 'join'    : someone just connected (no-op — `sync` will catch it)
 *   - 'leave'   : someone just disconnected (drop them from local
 *                 state immediately so the dot disappears; the server
 *                 doesn't always re-broadcast `sync` for the last
 *                 departing user when their tab closes)
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
        (entries as PresenceUser[]).forEach((p) => list.push(p))
      })
      setOnline(list)
    }

    channel
      .on('presence', { event: 'sync' }, syncFromState)
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        // The connection-closed peer is in `leftPresences`. Remove them
        // by id without waiting for the server's next `sync` (which
        // doesn't always fire for the last leaver). supabase-js typing
        // widens the payload to `{[key: string]: any}` so we cast through
        // unknown — same shape we used to track the user via `track()`.
        const leftIds = new Set(
          (leftPresences as unknown as PresenceUser[]).map((p) => p.user_id)
        )
        if (leftIds.size === 0) return
        setOnline((prev) => prev.filter((p) => !leftIds.has(p.user_id)))
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
