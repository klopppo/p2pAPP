import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Bridges supabase-js auth events into React Query.
 *
 * Without this, a silent token death (refresh failure, sign-out in another
 * tab, restored session that finished restoring after mount) leaves every
 * wallet-scoped query holding its last cache entry while RLS starts denying —
 * the UI keeps showing stale or empty chat data with no way to recover until a
 * manual reload. Invalidating `wallet-session` re-evaluates the session gate;
 * the chat/user roots are invalidated too so a session that becomes live again
 * refetches immediately instead of waiting for the poll interval.
 *
 * Mount once, inside `QueryClientProvider`.
 */
export function AuthSessionSync() {
  const qc = useQueryClient()

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      // Defer past the callback: supabase-js holds an internal auth lock
      // while dispatching this event, and the invalidated queries call
      // `supabase.auth.getSession()` again. Invoking that synchronously here
      // can deadlock (a documented supabase-js footgun) — a macrotask lets
      // the lock release first.
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['wallet-session'] })
        void qc.invalidateQueries({ queryKey: ['current-user'] })
        void qc.invalidateQueries({ queryKey: ['messages'] })
        void qc.invalidateQueries({ queryKey: ['conversation'] })
        void qc.invalidateQueries({ queryKey: ['conversations'] })
        void qc.invalidateQueries({ queryKey: ['trades'] })
        void qc.invalidateQueries({ queryKey: ['trade'] })
        void qc.invalidateQueries({ queryKey: ['disputes'] })
        void qc.invalidateQueries({ queryKey: ['dispute'] })
        void qc.invalidateQueries({ queryKey: ['notifications'] })
        void qc.invalidateQueries({ queryKey: ['notification-prefs'] })
      }, 0)
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  return null
}
