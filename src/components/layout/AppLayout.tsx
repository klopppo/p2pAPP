import type { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { PageContainer } from './PageContainer'
import { ChainGuard } from '@/components/custom/ChainGuard'

interface AppLayoutProps {
  children?: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      <Navbar showTabs />
      <ChainGuard />
      <main className="flex-1 flex flex-col min-h-0">
        <PageContainer type="app">
          {children || <Outlet />}
        </PageContainer>
      </main>
      <Footer />
    </div>
  )
}
