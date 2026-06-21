import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Tag,
  BookOpen,
  MessageCircle,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Globe,
  DollarSign,
  MoreHorizontal,
} from 'lucide-react'
import { WalletConnectButton } from '@/components/custom/WalletConnectButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const NAV_LINKS = [
  { label: 'Dashboard', to: '/app/dashboard' as const, icon: LayoutDashboard },
  { label: 'Offers', to: '/app/offers' as const, icon: Tag },
]

const RESOURCE_LINKS = [
  { label: 'Docs', href: 'https://docs.example.com', icon: BookOpen },
  { label: 'Discord', href: 'https://discord.gg/example', icon: MessageCircle },
]

const LANGUAGES = ['English', 'Español', 'Français', 'Deutsch', '中文']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'ETH']

interface NavbarProps {
  showTabs?: boolean
}

export function Navbar({ showTabs = false }: NavbarProps) {
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showLang, setShowLang] = useState(false)
  const [showCurr, setShowCurr] = useState(false)
  const [language, setLanguage] = useState('English')
  const [currency, setCurrency] = useState('USD')
  const location = useLocation()
  const currentPath = location.pathname

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="sticky top-0 inset-x-0 z-50 bg-transparent"
    >
      <div className="max-w-[1100px] mx-auto px-4 md:px-6 w-full flex h-14 items-center justify-between gap-4">
        {/* Left: Logo + nav links */}
        <div className="flex items-center gap-6">
          <Link to="/" className="text-xl font-bold text-foreground">
            P2P Escrow
          </Link>

          {/* Desktop nav */}
          {showTabs && (
            <nav className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const isActive = currentPath.startsWith(link.to)

                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-foreground/10 text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                    }`}
                  >
                    <link.icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                )
              })}

              {/* Resources dropdown */}
              <DropdownMenu onOpenChange={setResourcesOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4" />
                    Resources
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${resourcesOpen ? 'rotate-180' : ''}`} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={8}
                  className="w-44 rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-lg overflow-hidden"
                >
                  {RESOURCE_LINKS.map((r) => (
                    <a
                      key={r.label}
                      href={r.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
                    >
                      <r.icon className="w-4 h-4" />
                      {r.label}
                    </a>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          )}
        </div>

        {/* Right: Preferences + Connect */}
        <div className="hidden md:flex items-center gap-2">
          {showTabs && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground hover:text-foreground hover:bg-card transition-all cursor-pointer"
                  aria-label="Global preferences"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-64 rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl p-0 overflow-hidden"
              >
                <DropdownMenuLabel className="px-4 pt-4 pb-2 text-base font-semibold text-foreground">
                  Global preferences
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="mx-4" />

                {/* Language row */}
                <div className="px-2 py-1">
                  {!showLang ? (
                    <button
                      onClick={() => setShowLang(true)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-accent transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <Globe className="w-4 h-4" />
                        Language
                      </div>
                      <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                        {language}
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </button>
                  ) : (
                    <div className="space-y-0.5">
                      <button
                        onClick={() => setShowLang(false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        <ChevronRight className="w-3 h-3 rotate-180" /> Back
                      </button>
                      {LANGUAGES.map((l) => (
                        <button
                          key={l}
                          onClick={() => {
                            setLanguage(l)
                            setShowLang(false)
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors cursor-pointer ${
                            l === language
                              ? 'bg-foreground/10 text-foreground font-semibold'
                              : 'hover:bg-accent text-foreground'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Currency row */}
                <div className="px-2 pb-2">
                  {!showCurr ? (
                    <button
                      onClick={() => setShowCurr(true)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-accent transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <DollarSign className="w-4 h-4" />
                        Currency
                      </div>
                      <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                        {currency}
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </button>
                  ) : (
                    <div className="space-y-0.5">
                      <button
                        onClick={() => setShowCurr(false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        <ChevronRight className="w-3 h-3 rotate-180" /> Back
                      </button>
                      {CURRENCIES.map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            setCurrency(c)
                            setShowCurr(false)
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors cursor-pointer ${
                            c === currency
                              ? 'bg-foreground/10 text-foreground font-semibold'
                              : 'hover:bg-accent text-foreground'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <WalletConnectButton />
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 text-foreground md:hidden cursor-pointer"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-border bg-background md:hidden"
          >
            <nav className="flex flex-col gap-1 px-5 py-4">
              {showTabs &&
                NAV_LINKS.map((link) => {
                  const isActive = currentPath.startsWith(link.to)

                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-foreground/10 text-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                      }`}
                    >
                      <link.icon className="w-4 h-4" />
                      {link.label}
                    </Link>
                  )
                })}
              {showTabs && (
                <div className="border-t border-border pt-2 mt-1">
                  <p className="px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Resources
                  </p>
                  {RESOURCE_LINKS.map((r) => (
                    <a
                      key={r.label}
                      href={r.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <r.icon className="w-4 h-4" />
                      {r.label}
                    </a>
                  ))}
                </div>
              )}
              <div className="mt-3 border-t border-border pt-3">
                <WalletConnectButton />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
