import { Suspense, useEffect, type ReactNode } from 'react'
import { AppPageFallback } from '@/components/custom/AppPageFallback'
import { Outlet, useLocation } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { PageContainer } from './PageContainer'
import { SignInPrompt } from '@/components/auth/SignInPrompt'
import { GlobalPresenceProvider } from '@/hooks/useGlobalPresence'
import { warmUpIpns } from '@/lib/ipfs'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children?: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { pathname } = useLocation()
  // The chat page is a fixed-height app surface: it owns the space between
  // the navbar and the viewport bottom and scrolls its own panes, so the
  // document itself must not scroll. Every other app page keeps the normal
  // document flow (min-h-screen + footer).
  const isChat = pathname.startsWith('/app/messages')
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
    <div
      className={cn(
        'relative z-10 flex flex-col',
        isChat ? 'h-[100dvh] overflow-hidden' : 'min-h-screen',
      )}
    >
      <Navbar showTabs />
      <main className={cn('flex-1 flex flex-col min-h-0', isChat && 'overflow-hidden')}>
        <GlobalPresenceProvider>
          <PageContainer type="app" padded={!isChat}>
            <Suspense fallback={<AppPageFallback />}>
              {children || <Outlet />}
            </Suspense>
          </PageContainer>
        </GlobalPresenceProvider>
      </main>
      {!isChat && <Footer />}
      {/* Non-blocking SIWE nudge: visible when a wallet is connected but no
          Supabase session exists yet. Button-driven — never auto-pops
          MetaMask. `ChainGuard` stays scoped to the escrow pages (ADR-011). */}
      <SignInPrompt />
    </div>
  )
}
