import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useCurrentUser } from './useCurrentUser'
import type { User } from '@/types/database'

/**
 * App-wide presence: every mounted `/app` page joins
 * `presence:coffernode:global` and tracks the connected user, so "online"
 * means connected to the app right now. Keys are `public.users.id`.
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
  // Remount on identity change so the online set resets and switching/logging
  // out never inherits the previous user's state.
  return (
    <GlobalPresenceInner key={user?.id ?? 'anon'} user={user}>
      {children}
    </GlobalPresenceInner>
  )
}

function GlobalPresenceInner({ user, children }: { user: User | null | undefined; children: ReactNode }) {
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const id = user?.id
    const nickname = user?.nickname ?? null
    if (!id) return

    // Presence topics keep a shared bare name across clients (unlike
    // postgres_changes, which uses uniqueRealtimeTopic()).
    const channel: RealtimeChannel = supabase.channel('presence:coffernode:global', {
      config: { presence: { key: id } },
    })

    // Re-baseline from the full state — two tabs share one key, so a single
    // `leave` must not flip the user offline.
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
          await channel.track({ user_id: id, nickname, online_at: new Date().toISOString() })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, user?.nickname])

  return <OnlineUsersContext.Provider value={online}>{children}</OnlineUsersContext.Provider>
}
