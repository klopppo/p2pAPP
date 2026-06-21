import { useConnect, useAccount, useDisconnect } from 'wagmi'
import MotionButton from '@/components/ui/motion-button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2 } from 'lucide-react'

export function WalletConnectButton() {
  const { connect, connectors, isPending } = useConnect()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address)
    }
  }

  if (!isConnected) {
    return (
      <div onClick={() => connect({ connector: connectors[0] })} className="cursor-pointer">
        {isPending ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Connecting...</span>
          </div>
        ) : (
          <MotionButton label="Connect Wallet" classes="bg-background text-foreground border border-border" />
        )}
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MotionButton
          label={`${address && formatAddress(address)}`}
          classes="bg-background text-foreground border border-border"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card border-border shadow-none rounded-2xl">
        <DropdownMenuItem onClick={copyAddress} className="rounded-xl">
          Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-xl">
          View Explorer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => disconnect()}
          className="text-red-500 rounded-xl"
        >
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
