import { Link } from 'react-router-dom'
import { WalletConnectButton } from '@/components/custom/WalletConnectButton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface NavbarProps {
  showTabs?: boolean
}

export function Navbar({ showTabs = false }: NavbarProps) {
  return (
    <nav className="max-w-[1000px] mx-auto px-4 md:px-6 w-full py-4 flex items-center justify-between">
      <Link to="/" className="text-2xl font-bold text-foreground">
        P2P Escrow
      </Link>
      {showTabs ? (
        <div className="flex items-center gap-6">
          <Link
            to="/app/dashboard"
            className="text-base text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
          <Link
            to="/app/offers"
            className="text-base text-muted-foreground hover:text-foreground transition-colors"
          >
            Offers
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="text-base text-muted-foreground hover:text-foreground">
                Resources
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-card border-border shadow-none rounded-2xl">
              <DropdownMenuItem className="rounded-xl">
                <a href="https://docs.example.com" target="_blank" rel="noopener noreferrer">
                  Documentation
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl">
                <a href="https://twitter.com/example" target="_blank" rel="noopener noreferrer">
                  Twitter
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl">
                <a href="https://discord.gg/example" target="_blank" rel="noopener noreferrer">
                  Discord
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <WalletConnectButton />
        </div>
      ) : (
        <WalletConnectButton />
      )}
    </nav>
  )
}
