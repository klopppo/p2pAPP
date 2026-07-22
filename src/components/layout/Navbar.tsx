import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
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
  User,
  ShieldAlert,
} from 'lucide-react'
import { WalletConnectButton } from '@/components/custom/WalletConnectButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const SOCIAL_LINKS = [
  {
    label: 'Telegram',
    href: 'https://t.me/',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    label: 'Discord',
    href: 'https://discord.gg/',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
      </svg>
    ),
  },
  {
    label: 'Twitter',
    href: 'https://twitter.com/',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: 'Github',
    href: 'https://github.com/',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
  },
]

const SocialLinks = ({ className = '' }: { className?: string }) => (
  <div className={`flex items-center gap-1 ${className}`}>
    {SOCIAL_LINKS.map((s) => (
      <a
        key={s.label}
        href={s.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={s.label}
        className="w-11 h-11 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
      >
        {s.icon}
      </a>
    ))}
  </div>
)

const NAV_LINKS = [
  { label: 'Messages', to: '/app/messages' as const, icon: MessageCircle },
  { label: 'Offers', to: '/app/offers' as const, icon: Tag },
  { label: 'Profile', to: '/app/profile' as const, icon: User },
]

const RESOURCE_LINKS: ReadonlyArray<
  | { label: string; to: string; icon: typeof ShieldAlert }
  | { label: string; href: string; icon: typeof ShieldAlert }
> = [
  // Internal route — uses `to`, rendered with <Link> for client-side nav.
  { label: 'Disputes', to: '/app/disputes', icon: ShieldAlert },
  // External links — use `href` + target="_blank".
  { label: 'Docs', href: 'https://docs.example.com', icon: BookOpen },
  { label: 'Discord', href: 'https://discord.gg/example', icon: MessageCircle },
] as const

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
  const navigate = useNavigate()
  const currentPath = location.pathname

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="inset-x-0 z-50 bg-transparent"
    >
      <div className="px-4 md:px-6 w-full flex h-14 items-center justify-between gap-4">
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
                >
                  <DropdownMenuGroup>
                    {RESOURCE_LINKS.map((r) => {
                      const Icon = r.icon
                      return 'to' in r ? (
                        // Internal route — client-side navigation via <Link>.
                        <DropdownMenuItem
                          key={r.label}
                          asChild
                          // Tell Radix to close the menu after the click; the
                          // dropdown would otherwise stay open through the
                          // route transition.
                          onSelect={(e) => {
                            e.preventDefault()
                            navigate(r.to)
                          }}
                        >
                          <Link to={r.to}>
                            <Icon className="w-4 h-4" />
                            {r.label}
                          </Link>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem key={r.label} asChild>
                          <a
                            href={r.href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Icon className="w-4 h-4" />
                            {r.label}
                          </a>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuGroup>
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

          {showTabs ? <WalletConnectButton /> : <SocialLinks />}
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
                  {RESOURCE_LINKS.map((r) => {
                    const Icon = r.icon
                    return 'to' in r ? (
                      // Internal route — client-side navigation; close menu on click.
                      <Link
                        key={r.label}
                        to={r.to}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        <Icon className="w-4 h-4" />
                        {r.label}
                      </Link>
                    ) : (
                      <a
                        key={r.label}
                        href={r.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        <Icon className="w-4 h-4" />
                        {r.label}
                      </a>
                    )
                  })}
                </div>
              )}
              <div className="mt-3 border-t border-border pt-3">
                {showTabs ? <WalletConnectButton /> : <SocialLinks className="justify-center" />}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
