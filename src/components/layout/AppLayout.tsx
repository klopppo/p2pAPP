import type { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { PageContainer } from './PageContainer'

interface AppLayoutProps {
  children?: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/*<div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-3/4 left-1/2 w-96 h-96 bg-blue-900/20 rounded-full blur-[120px]" />
      </div>*/}

      <Navbar showTabs />
      <main className="flex-1">
        <PageContainer type="app">
          {children || <Outlet />}
        </PageContainer>
      </main>
      <Footer />
    </div>
  )
}
