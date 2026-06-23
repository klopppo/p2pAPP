import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from './wagmi'
import { LandingPage } from './pages/LandingPage'
import { OffersPage } from './pages/OffersPage'
import { ProfilePage } from './pages/ProfilePage'
import { ChatPage } from './pages/ChatPage'
import { CreateOfferPage } from './pages/CreateOfferPage'
import { OpenOfferPage } from './pages/OpenOfferPage'
import { AppLayout } from './components/layout/AppLayout'

const queryClient = new QueryClient()

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app" element={<AppLayout><Outlet /></AppLayout>}>
              <Route path="offers" element={<OffersPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="messages" element={<ChatPage />} />
              <Route path="create-offer" element={<CreateOfferPage />} />
              <Route path="offer/:id" element={<OpenOfferPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App
