// Mirrors the live Supabase session into `coffernode_session`, the one HTTP
// cookie the edge middleware reads to derive per-route cache keys.
//
// Runs on mount and re-syncs on every supabase auth event (SIGNED_IN /
// SIGNED_OUT / TOKEN_REFRESHED / …), so the mirror always trails the real
// session: wallet present → cookie written, wallet gone → cookie expired.
//
// The wallet address it writes is intentionally public data (rendered on the
// user's own public profile) — it is NOT a credential. See
// `src/lib/sessionCookie.ts` for the security rationale.

import { useEffect } from 'react'
import { supabase, getSessionWallet } from '@/lib/supabase'
import { writeSessionCookie } from '@/lib/sessionCookie'

export function SessionCookieSync() {
  useEffect(() => {
    let cancelled = false

    const sync = () => {
      void getSessionWallet()
        .then((wallet) => {
          if (!cancelled) writeSessionCookie(wallet)
        })
        // Never let a failed identity read kill app boot — the cookie just
        // stays/starts absent and the edge falls back to the anonymous key.
        .catch(() => {
          if (!cancelled) writeSessionCookie(null)
        })
    }

    // Initial sync (hydrates the cookie from the persisted localStorage
    // session before the first document request is likely to matter).
    sync()

    // Keep trailing the session. Defer past the auth lock (same pattern as
    // AuthSessionSync — calling getSession() inside the dispatch can deadlock
    // supabase-js), hence the macrotask.
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(sync, 0))

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  return null
}