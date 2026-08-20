import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Rocket,
  ArrowLeftRight,
  Shield,
  FileEdit,
  Gavel,
  HelpCircle,
  FileText,
  Menu,
  X,
} from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { CofferNodeLogo } from '@/components/custom/CofferNodeLogo'

const DOCS_SECTIONS = [
  { label: 'Overview', to: '/docs', icon: BookOpen },
  { label: 'Getting Started', to: '/docs/getting-started', icon: Rocket },
  { label: 'How Trading Works', to: '/docs/how-trading-works', icon: ArrowLeftRight },
  { label: 'Escrow & Security', to: '/docs/escrow-and-security', icon: Shield },
  { label: 'Creating Offers', to: '/docs/creating-offers', icon: FileEdit },
  { label: 'Disputes', to: '/docs/disputes', icon: Gavel },
  { label: 'FAQ', to: '/docs/faq', icon: HelpCircle },
  { label: 'Terms of Service', to: '/docs/terms-of-service', icon: FileText },
]

export function DocsLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* Background blurs */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-3/4 left-1/2 w-96 h-96 bg-blue-900/20 rounded-full blur-[120px]" />
      </div>

      {/* Navbar */}
      <div className="relative z-20">
        <div className="px-4 md:px-6 w-full flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-foreground">
              <CofferNodeLogo variant="full" theme="gray" className="h-8" />
            </Link>
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20">
              <BookOpen className="w-3 h-3" />
              Docs
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to App
            </Link>
          </div>
        </div>
      </div>

      {/* Body: sidebar + main */}
      <div className="flex-1 flex w-full max-w-[1200px] mx-auto">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-[220px] shrink-0 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto py-6 pr-2">
          <nav className="space-y-1">
            {DOCS_SECTIONS.map((section) => {
              const isActive =
                section.to === '/docs'
                  ? location.pathname === '/docs'
                  : location.pathname.startsWith(section.to)
              const Icon = section.icon

              return (
                <Link
                  key={section.to}
                  to={section.to}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-foreground/10 text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {section.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-card/90 backdrop-blur-xl border border-border shadow-xl flex items-center justify-center text-foreground cursor-pointer"
          aria-label="Open docs menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile drawer overlay */}
        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
                onClick={() => setMobileOpen(false)}
              />
              <motion.aside
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-card/95 backdrop-blur-xl border-r border-border p-6 md:hidden overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <Link to="/" onClick={() => setMobileOpen(false)}>
                    <CofferNodeLogo variant="icon" theme="gray" className="h-10 w-10" />
                  </Link>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-foreground/5 text-muted-foreground cursor-pointer"
                    aria-label="Close menu"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <nav className="space-y-1">
                  {DOCS_SECTIONS.map((section) => {
                    const isActive =
                      section.to === '/docs'
                        ? location.pathname === '/docs'
                        : location.pathname.startsWith(section.to)
                    const Icon = section.icon

                    return (
                      <Link
                        key={section.to}
                        to={section.to}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-foreground/10 text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {section.label}
                      </Link>
                    )
                  })}
                </nav>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main content */}
        <main className="flex-1 min-w-0 py-6 px-4 md:px-8">
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  )
}
