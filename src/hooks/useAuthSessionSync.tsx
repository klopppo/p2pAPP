import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const QUERY_ROOTS = [
  'wallet-session',
  'current-user',
  'messages',
  'conversation',
  'conversations',
  'trades',
  'trade',
  'disputes',
  'dispute',
  'notifications',
  'notification-prefs',
]

/**
 * Bridge supabase-js auth events into React Query. Without this a silent token
 * death leaves wallet-scoped queries holding stale/RLS-denied data until reload.
 * Mount once, inside `QueryClientProvider`.
 */
export function AuthSessionSync() {
  const qc = useQueryClient()

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      // Defer past the callback: supabase-js holds its auth lock while
      // dispatching, and invalidated queries call getSession() again — running
      // them synchronously can deadlock. A macrotask lets the lock release.
      setTimeout(() => {
        for (const key of QUERY_ROOTS) void qc.invalidateQueries({ queryKey: [key] })
      }, 0)
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  return null
}
