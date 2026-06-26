import { useAccount, useDisconnect } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
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
  const { openConnectModal, connectModalOpen } = useConnectModal()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`

  const copyAddress = async () => {
    if (!address) return
    try {
      // Async Clipboard API requires a secure context (HTTPS) and isn't
      // available in every browser, so fall back to execCommand for the
      // non-secure / older-browser cases.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = address
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
    } catch {
      // Swallow clipboard errors — copying is best-effort.
    }
  }

  if (!isConnected) {
    return connectModalOpen ? (
      <div className="flex items-center gap-2 h-10 px-4 bg-background text-foreground border border-border rounded-full">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Connecting...</span>
      </div>
    ) : (
      <MotionButton
        label="Connect Wallet"
        classes="bg-background text-foreground border border-border"
        onClick={openConnectModal}
      />
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="cursor-pointer">
          <MotionButton
            label={address ? formatAddress(address) : ''}
            classes="bg-background text-foreground border border-border"
          />
        </div>
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
