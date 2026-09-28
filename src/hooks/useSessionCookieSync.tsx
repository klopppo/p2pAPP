// Mirrors the live session wallet into `coffernode_session` (public data, not a
// credential) so the edge middleware can derive per-route cache keys.

import { useEffect } from 'react'
import { supabase, getSessionWallet } from '@/lib/supabase'
import { writeSessionCookie } from '@/lib/sessionCookie'

export function SessionCookieSync() {
  useEffect(() => {
    let cancelled = false
    const sync = () => {
      // Never let a failed identity read kill app boot — the edge falls back
      // to the anonymous cache key.
      void getSessionWallet()
        .then((wallet) => { if (!cancelled) writeSessionCookie(wallet) })
        .catch(() => { if (!cancelled) writeSessionCookie(null) })
    }
    sync()

    // Defer past the auth lock (same deadlock risk as AuthSessionSync).
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(sync, 0))
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  return null
}
