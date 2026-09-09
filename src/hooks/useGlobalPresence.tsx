import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useCurrentUser } from './useCurrentUser'
import type { User } from '@/types/database'

/**
 * App-wide presence channel. Every mounted `/app` page joins
 * `presence:coffernode:global` and tracks the connected wallet's user row,
 * so "online" means "connected to the app with a wallet right now" — not
 * "last_active_at was ever non-null" (the old profile badge) and not "is
 * actively viewing THIS conversation" (the old per-conversation presence,
 * which left the chat green dot gray whenever the partner browsed
 * elsewhere).
 *
 * Consumers read a live `Set<userId>` of currently-online users via
 * `useGlobalPresence()`. Presence keys are the `public.users.id`, which is
 * what `ConversationView.participants[].user_id` / `profile.id` use, so the
 * two line up without joins.
 */
const OnlineUsersContext = createContext<ReadonlySet<string>>(new Set())

export function useGlobalPresence(): ReadonlySet<string> {
  return useContext(OnlineUsersContext)
}

interface PresenceUser {
  user_id: string
  nickname?: string | null
  online_at?: string
}

export function GlobalPresenceProvider({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser()
  // Remount on identity change so the online set resets without a
  // synchronous setState in an effect — and so switching/logging out of a
  // wallet never inherits the previous user's state.
  return <GlobalPresenceInner key={user?.id ?? 'anon'} user={user}>{children}</GlobalPresenceInner>
}

function GlobalPresenceInner({
  user,
  children,
}: {
  user: User | null | undefined
  children: ReactNode
}) {
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const id = user?.id
    const nickname = user?.nickname ?? null
    if (!id) return

    // Broadcast/presence topic — must keep a shared bare name across
    // clients (uniqueRealtimeTopic() is only for postgres_changes).
    const channel: RealtimeChannel = supabase.channel('presence:coffernode:global', {
      config: { presence: { key: id } },
    })

    // Re-baseline from the full presence state. Never subtract per-user on
    // `leave`: a wallet open in two tabs tracks two entries under the same
    // key, so closing one tab must NOT flip them offline.
    const sync = () => {
      const state = channel.presenceState<PresenceUser>()
      const ids = new Set<string>()
      Object.values(state).forEach((entries) => {
        ;(entries as PresenceUser[]).forEach((p) => {
          if (p.user_id) ids.add(p.user_id)
        })
      })
      setOnline(ids)
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: id,
            nickname,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, user?.nickname])

  const value = useMemo(() => online, [online])
  return <OnlineUsersContext.Provider value={value}>{children}</OnlineUsersContext.Provider>
}