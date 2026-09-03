import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, useAccount } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { Toaster } from 'sonner'
import '@rainbow-me/rainbowkit/styles.css'
import { config } from './wagmi'
import { LandingPage } from './pages/LandingPage'
import { OffersPage } from './pages/OffersPage'
import { ProfilePage } from './pages/ProfilePage'
import { EditProfilePage } from './pages/EditProfilePage'
import { ChatLayout } from './components/custom/chat/ChatLayout'
import { CreateOfferPage } from './pages/CreateOfferPage'
import { OpenOfferPage } from './pages/OpenOfferPage'
import { TradePage } from './pages/TradePage'
import { TradesPage } from './pages/TradesPage'
import { TradeDetailPage } from './pages/TradeDetailPage'
import { DisputePage } from './pages/DisputePage'
import { DisputesListPage } from './pages/DisputesListPage'
import { DisputeDetailPage } from './pages/DisputeDetailPage'
import { AppLayout } from './components/layout/AppLayout'
import { DocsLayout } from './pages/docs/DocsLayout'
import DocsIndex from './pages/docs/index'
import DocsGettingStarted from './pages/docs/GettingStarted'
import DocsHowTradingWorks from './pages/docs/HowTradingWorks'
import DocsEscrowAndSecurity from './pages/docs/EscrowAndSecurity'
import DocsCreatingOffers from './pages/docs/CreatingOffers'
import DocsDisputes from './pages/docs/Disputes'
import DocsFAQ from './pages/docs/FAQ'
import DocsTermsOfService from './pages/docs/TermsOfService'
import { UserSync } from './hooks/useSyncUser'
import { TrustlessFlowOverlay } from './components/custom/TrustlessFlow'
import { CookieConsent } from './components/custom/CookieConsent'
import { attachQueryPersister, hydrateQueryCache } from './lib/queryPersister'

/**
 * One QueryClient for the lifetime of the page. `gcTime` is bumped to 24h
 * so query snapshots survive a tab close / open cycle and match the
 * `queryPersister` MAX_AGE_MS window.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24h — align with persister window
      staleTime: 1000 * 5, // 5s by default; individual queries can override
      retry: 1,
    },
  },
})

/**
 * Initial buster — always 'anon' at module init time because wagmi's
 * useAccount() hasn't resolved yet. The real (wallet-specific) buster is
 * applied later in QueryClientWithPersistence's useState initializer,
 * which runs synchronously during the very first render, BEFORE any
 * child component can fire its useQuery(). This eliminates the
 * 'useEffect runs after first render' race that left the profile page
 * showing a loading state for one frame.
 */
const INITIAL_BUSTER = 'wallet:anon'

/**
 * Inner component — runs after `WagmiProvider` so `useAccount()` is
 * available. The buster keys the persisted cache to the connected
 * wallet so disconnecting / switching invalidates it without manual
 * clearing.
 */
function QueryClientWithPersistence() {
  const { address } = useAccount()
  // Stable string so the effect deps don't churn on every render.
  const buster = useMemo(
    () => `wallet:${address?.toLowerCase() ?? 'anon'}`,
    [address],
  )
  // The first-render buster: starts as INITIAL_BUSTER ('wallet:anon')
  // because wagmi's useAccount() hasn't resolved yet. As soon as the
  // wallet connects and address changes, the useState setter below
  // re-runs the initializer with the real buster — synchronously, during
  // render, before any child useQuery() can fire. This eliminates the
  // 'useEffect runs after first render' race.
  const [currentBuster, setBuster] = useState(() => {
    hydrateQueryCache(queryClient, () => INITIAL_BUSTER)
    return INITIAL_BUSTER
  })
  // When the wallet changes, re-hydrate with the new buster before any
  // queries under the new buster fire. This is also synchronous because
  // useState's initializer runs during the next render's setup phase.
  if (buster !== currentBuster) {
    hydrateQueryCache(queryClient, () => buster)
    setBuster(buster) // setState during render — React accepts this for
                      // derived state as long as the new value is stable
                      // (it is — we just set it).
  }
  // Write subscription — re-attaches when the buster changes so the
  // next writes go out with the right key.
  useEffect(() => {
    return attachQueryPersister(queryClient, () => currentBuster)
  }, [currentBuster])
  return null
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: 'hsl(var(--primary))',
          borderRadius: 'large',
        })}>
          <QueryClientWithPersistence />
          <TrustlessFlowOverlay />
          <CookieConsent />
          <BrowserRouter>
            <UserSync />
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/app" element={<AppLayout><Outlet /></AppLayout>}>
                <Route path="offers" element={<OffersPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="profile/:walletAddress" element={<ProfilePage />} />
                <Route path="profile/edit" element={<EditProfilePage />} />
                <Route path="messages" element={<ChatLayout />} />
                <Route path="messages/:conversationId" element={<ChatLayout />} />
                <Route path="create-offer" element={<CreateOfferPage />} />
                <Route path="offer/:id" element={<OpenOfferPage />} />
                <Route path="trade/:id" element={<TradePage />} />
                <Route path="trades" element={<TradesPage />} />
                <Route path="trades/:id" element={<TradeDetailPage />} />
                <Route path="dispute" element={<DisputePage />} />
                <Route path="disputes" element={<DisputesListPage />} />
                <Route path="disputes/:id" element={<DisputeDetailPage />} />
              </Route>
              <Route path="/docs" element={<DocsLayout />}>
                <Route index element={<DocsIndex />} />
                <Route path="getting-started" element={<DocsGettingStarted />} />
                <Route path="how-trading-works" element={<DocsHowTradingWorks />} />
                <Route path="escrow-and-security" element={<DocsEscrowAndSecurity />} />
                <Route path="creating-offers" element={<DocsCreatingOffers />} />
                <Route path="disputes" element={<DocsDisputes />} />
                <Route path="faq" element={<DocsFAQ />} />
                <Route path="terms-of-service" element={<DocsTermsOfService />} />
              </Route>
            </Routes>
          </BrowserRouter>
          {/* Single, app-wide toast host. Use `toast` from 'sonner' anywhere. */}
          <Toaster theme="dark" position="bottom-right" richColors closeButton />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App;
