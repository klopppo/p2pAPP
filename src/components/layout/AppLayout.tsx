import { useEffect, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { PageContainer } from './PageContainer'
import { ChainGuard } from '@/components/custom/ChainGuard'
import { SignInPrompt } from '@/components/auth/SignInPrompt'
import { GlobalPresenceProvider } from '@/hooks/useGlobalPresence'
import { warmUpIpns } from '@/lib/ipfs'

interface AppLayoutProps {
  children?: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  // Audit #8: pre-warm the Supabase session so the first dispute evidence
  // upload uses the shorter (warm-path) timeout. Schedule on idle so the
  // warm-up doesn't block first paint; best-effort — failures here just
  // leave the first upload on the cold-path 120s budget.
  useEffect(() => {
    const trigger = () => {
      void warmUpIpns()
    }
    if (typeof window === 'undefined') return
    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }
    const w = window as IdleWindow
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(trigger, { timeout: 5_000 })
      return () => {
        // cancelIdleCallback is the matching API; guard for older Safari.
        const w2 = window as IdleWindow & {
          cancelIdleCallback?: (id: number) => void
        }
        w2.cancelIdleCallback?.(id)
      }
    }
    // Fallback for browsers without requestIdleCallback — defer to a
    // short setTimeout so the work still happens after first paint.
    const id = window.setTimeout(trigger, 1_500)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      <Navbar showTabs />
      <ChainGuard />
      <main className="flex-1 flex flex-col min-h-0">
        <GlobalPresenceProvider>
          <PageContainer type="app">
            {children || <Outlet />}
          </PageContainer>
        </GlobalPresenceProvider>
      </main>
      <Footer />
      {/* Non-blocking SIWE nudge. Only visible when the user has a
          connected wallet but no signature; clicking the backdrop (or
          the X / 'Later' button) dismisses for this browser session. The
          page is fully interactive underneath — Supabase / chain queries
          still require a session, so action buttons that need it surface
          their own inline 'sign-in required' toast. */}
      <SignInPrompt />
    </div>
  )
}
