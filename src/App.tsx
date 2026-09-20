import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import type { ComponentType } from "react"
import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  useLocation,
} from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, useAccount } from "wagmi"
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit"
import { Toaster } from "sonner"
import { useTheme } from "@/components/theme-provider"
import "@rainbow-me/rainbowkit/styles.css"
import { config } from "./wagmi"
import { AppLayout } from "./components/layout/AppLayout"
import { AppPageFallback } from "./components/custom/AppPageFallback"
import { AppErrorBoundary } from "./components/ErrorBoundary"

import { DocsLayout } from "./pages/docs/DocsLayout"
import { UserSync } from "./hooks/useSyncUser"
import { AuthSessionSync } from "./hooks/useAuthSessionSync"
import { SessionCookieSync } from "./hooks/useSessionCookieSync"
import { usePrefetchAppData } from "./hooks/usePrefetchAppData"
import { TrustlessFlowOverlay } from "./components/custom/TrustlessFlow"
import { CookieConsent } from "./components/custom/CookieConsent"
import { attachQueryPersister, hydrateQueryCache } from "./lib/queryPersister"
import { seedEdgeData } from "@/lib/edgeData"

/**
 * Route-level code splitting. Every page is a lazy chunk loaded on first
 * navigation; the layout, navbar and shared Shell stay in the eager core so
 * navigation always renders a skeleton immediately (see AppPageFallback).
 *
 * App pages are named exports; the docs pages export default, so those two
 * import shapes need different factories.
 */
const lazyNamed = (
  loader: () => Promise<{ [key: string]: unknown }>,
  name: string
) =>
  lazy(() => loader().then((mod) => ({ default: mod[name] as ComponentType })))

const LandingPage = lazyNamed(
  () => import("./pages/LandingPage"),
  "LandingPage"
)
const ReferralLandingPage = lazyNamed(
  () => import("./pages/ReferralLandingPage"),
  "ReferralLandingPage"
)
const OffersPage = lazyNamed(() => import("./pages/OffersPage"), "OffersPage")
const ProfilePage = lazyNamed(
  () => import("./pages/ProfilePage"),
  "ProfilePage"
)
const EditProfilePage = lazyNamed(
  () => import("./pages/EditProfilePage"),
  "EditProfilePage"
)
const ChatLayout = lazyNamed(
  () => import("./components/custom/chat/ChatLayout"),
  "ChatLayout"
)
const CreateOfferPage = lazyNamed(
  () => import("./pages/CreateOfferPage"),
  "CreateOfferPage"
)
const EditOfferPage = lazyNamed(
  () => import("./pages/EditOfferPage"),
  "EditOfferPage"
)
const OpenOfferPage = lazyNamed(
  () => import("./pages/OpenOfferPage"),
  "OpenOfferPage"
)
const TradePage = lazyNamed(() => import("./pages/TradePage"), "TradePage")
const TradesPage = lazyNamed(() => import("./pages/TradesPage"), "TradesPage")
const TradeDetailPage = lazyNamed(
  () => import("./pages/TradeDetailPage"),
  "TradeDetailPage"
)
const DisputePage = lazyNamed(
  () => import("./pages/DisputePage"),
  "DisputePage"
)
const DisputesListPage = lazyNamed(
  () => import("./pages/DisputesListPage"),
  "DisputesListPage"
)
const DisputeDetailPage = lazyNamed(
  () => import("./pages/DisputeDetailPage"),
  "DisputeDetailPage"
)
const OperatorDashboardPage = lazyNamed(
  () => import("./pages/OperatorDashboardPage"),
  "OperatorDashboardPage"
)

const DocsIndex = lazy(() => import("./pages/docs/index"))
const DocsGettingStarted = lazy(() => import("./pages/docs/GettingStarted"))
const DocsHowTradingWorks = lazy(() => import("./pages/docs/HowTradingWorks"))
const DocsEscrowAndSecurity = lazy(
  () => import("./pages/docs/EscrowAndSecurity")
)
const DocsCreatingOffers = lazy(() => import("./pages/docs/CreatingOffers"))
const DocsDisputes = lazy(() => import("./pages/docs/Disputes"))
const DocsFAQ = lazy(() => import("./pages/docs/FAQ"))
const DocsTermsOfService = lazy(() => import("./pages/docs/TermsOfService"))

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

// Seed the react-query cache from the edge-injected __EDGE_DATA__ blob
// (if present). Must run BEFORE the localStorage persister hydrates so the
// server's public projection takes precedence over a possibly-stale snapshot.
seedEdgeData(queryClient)

/**
 * Initial buster — always 'anon' at module init time because wagmi's
 * useAccount() hasn't resolved yet. The real (wallet-specific) buster is
 * applied later in QueryClientWithPersistence's useState initializer,
 * which runs synchronously during the very first render, BEFORE any
 * child component can fire its useQuery(). This eliminates the
 * 'useEffect runs after first render' race that left the profile page
 * showing a loading state for one frame.
 */
const INITIAL_BUSTER = "wallet:anon"

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
    () => `wallet:${address?.toLowerCase() ?? "anon"}`,
    [address]
  )
  // The first-render buster: starts as INITIAL_BUSTER ('wallet:anon')
  // because wagmi's useAccount() hasn't resolved yet. As soon as the
  // wallet connects and address changes, the useState setter below
  // re-runs the initializer with the real buster — synchronously, during
  // render, before any child useQuery() can fire. This eliminates the
  // 'useEffect runs after first render' race.
  const [currentBuster, setBuster] = useState(() => {
    hydrateQueryCache(queryClient, () => INITIAL_BUSTER, { skipExisting: true })
    return INITIAL_BUSTER
  })
  // When the wallet changes, re-hydrate with the new buster before any
  // queries under the new buster fire. This is also synchronous because
  // useState's initializer runs during the next render's setup phase.
  if (buster !== currentBuster) {
    hydrateQueryCache(queryClient, () => buster, { skipExisting: true })
    setBuster(buster) // setState during render — React accepts this for
    // derived state as long as the new value is stable
    // (it is — we just set it).
  }
  // Write subscription — re-attaches when the buster changes so the
  // next writes go out with the right key.
  useEffect(() => {
    return attachQueryPersister(queryClient, () => currentBuster)
  }, [currentBuster])
  // Warm every main-surface cache once a live session exists (see hook docs).
  usePrefetchAppData()
  return null
}

/**
 * Boundary + router. The boundary resets on route change so a broken chunk
 * doesn't wedge the whole app; the fallback (ADR-013) is styled with tokens.
 */
function RoutesWithinBoundary() {
  const location = useLocation()
  return (
    <AppErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<AppPageFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/r/:code" element={<ReferralLandingPage />} />
          <Route
            path="/app"
            element={
              <AppLayout>
                <Outlet />
              </AppLayout>
            }
          >
            <Route path="offers" element={<OffersPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="profile/:walletAddress" element={<ProfilePage />} />
            <Route path="profile/edit" element={<EditProfilePage />} />
            <Route path="messages" element={<ChatLayout />} />
            <Route path="messages/:conversationId" element={<ChatLayout />} />
            <Route path="create-offer" element={<CreateOfferPage />} />
            <Route path="offer/:id" element={<OpenOfferPage />} />
            <Route path="offer/:id/edit" element={<EditOfferPage />} />
            <Route path="trade/:id" element={<TradePage />} />
            <Route path="trades" element={<TradesPage />} />
            <Route path="trades/:id" element={<TradeDetailPage />} />
            <Route path="dispute" element={<DisputePage />} />
            <Route path="disputes" element={<DisputesListPage />} />
            <Route path="disputes/:id" element={<DisputeDetailPage />} />
            <Route path="operator" element={<OperatorDashboardPage />} />
          </Route>

          <Route path="/docs" element={<DocsLayout />}>
            <Route index element={<DocsIndex />} />
            <Route path="getting-started" element={<DocsGettingStarted />} />
            <Route path="how-trading-works" element={<DocsHowTradingWorks />} />
            <Route
              path="escrow-and-security"
              element={<DocsEscrowAndSecurity />}
            />
            <Route path="creating-offers" element={<DocsCreatingOffers />} />
            <Route path="disputes" element={<DocsDisputes />} />
            <Route path="faq" element={<DocsFAQ />} />
            <Route path="terms-of-service" element={<DocsTermsOfService />} />
          </Route>
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  )
}

function App() {
  const { theme } = useTheme()
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "hsl(var(--primary))",
            borderRadius: "large",
          })}
        >
          <QueryClientWithPersistence />
          <AuthSessionSync />
          <SessionCookieSync />
          <TrustlessFlowOverlay />
          <CookieConsent />
          <BrowserRouter>
            <UserSync />
            {/* Top-level boundary: covers the Landing page and any chunk that
                suspends before a layout mounts. Nested layouts (AppLayout /
                DocsLayout) own their own boundaries so the nav stays put. */}
            <RoutesWithinBoundary />
          </BrowserRouter>
          {/* Single, app-wide toast host. Use `toast` from 'sonner' anywhere. */}
          <Toaster
            theme={theme}
            position="bottom-right"
            richColors
            closeButton
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App
