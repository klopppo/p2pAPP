import { useState } from 'react'
import { useDisconnect } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import MotionButton from '@/components/ui/motion-button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2, User, Copy, ExternalLink } from 'lucide-react'
import { useSignedInStatus } from '@/hooks/useSignedInStatus'
import { ensureWalletSession, signOut } from '@/lib/supabase'
import { explorerBase } from '@/lib/explorer'
import { signWalletMessage } from '@/lib/walletSigner'

export function WalletConnectButton() {
  const { openConnectModal, connectModalOpen } = useConnectModal()
  // The navbar only flips to the "connected" affordance when BOTH the wallet
  // is connected AND a live Supabase session exists (see useSignedInStatus).
  // Until then, we show the "Connect wallet" / "Sign in" CTA so the top header
  // is consistent with the rest of the app (and with SignInPrompt).
  const { address, isConnected, isFullySignedIn } = useSignedInStatus()
  const { disconnect } = useDisconnect()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [signingIn, setSigningIn] = useState(false)

  /**
   * One CTA, two jobs:
   *   - no wallet        → open the RainbowKit picker
   *   - wallet connected → run SIWE for the already-connected wallet. Without
   *     this the label said "Sign in" but clicking opened a connect modal that
   *     could never complete the missing session (the wallet was already
   *     connected), leaving the user stuck on empty chats.
   */
  const handleConnectOrSign = async () => {
    if (!isConnected || !address) {
      openConnectModal?.()
      return
    }
    setSigningIn(true)
    try {
      // A deliberate sign-in clears any persisted rejection so a prior
      // dismissed prompt doesn't silently no-op this click.
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(`coffernode:siwe:declined:${address.toLowerCase()}`)
      }
      const { session } = await ensureWalletSession(address, {
        signMessage: signWalletMessage,
        force: true,
      })
      // `ensureWalletSession` resolves even on failure (returns
      // `session: false`); it never rejects. Treat a non-session as an error
      // so the user isn't left with a silently-stopped spinner.
      if (!session) {
        toast.error(t('signInPrompt.failed', {
          defaultValue: 'Sign-in was not completed. Please try again.',
        }))
        return
      }
      void qc.invalidateQueries({ queryKey: ['wallet-session'] })
      void qc.invalidateQueries({ queryKey: ['current-user'] })
      void qc.invalidateQueries({ queryKey: ['messages'] })
      void qc.invalidateQueries({ queryKey: ['conversation'] })
      void qc.invalidateQueries({ queryKey: ['conversations'] })
    } catch {
      toast.error(t('signInPrompt.failed', {
        defaultValue: 'Sign-in was not completed. Please try again.',
      }))
    } finally {
      setSigningIn(false)
    }
  }

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

  if (!isFullySignedIn) {
    // Either the wallet isn't connected, or it's connected without a live
    // session. Both paths funnel through `handleConnectOrSign`, which opens
    // the picker or runs SIWE depending on connection state.
    return connectModalOpen || signingIn ? (
      <div className="flex items-center gap-2 h-10 px-4 bg-background text-foreground border border-border rounded-full">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">
          {signingIn
            ? t('signInPrompt.signing', { defaultValue: 'Signing…' })
            : t('wallet.connecting')}
        </span>
      </div>
    ) : (
      <MotionButton
        label={
          isConnected && !isFullySignedIn
            ? t('wallet.signIn', { defaultValue: 'Sign in' })
            : t('wallet.connectWallet')
        }
        classes="bg-background text-foreground border border-border"
        onClick={() => void handleConnectOrSign()}
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
          <Copy className="w-4 h-4" />
          {t('wallet.copyAddress')}
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="rounded-xl">
          <a
            href={address ? `${explorerBase.address}${address}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            {t('wallet.viewExplorer')}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate('/app/profile/edit')}
          className="rounded-xl"
        >
          <User className="w-4 h-4" />
          {t('wallet.editProfile')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            // Clear the SIWE markers (success + rejection for this wallet)
            // synchronously, before disconnecting. signOut's own marker
            // cleanup also runs from useSyncUser's effect, but doing it here
            // means there's no race window where the prompt could re-trigger
            // on the next connect.
            try {
              await signOut()
            } catch {
              // signOut's Supabase call may fail (no active session) —
              // ignore; the localStorage marker cleanup below still runs.
            }
            if (address) {
              localStorage.removeItem('coffernode:siwe:last')
              localStorage.removeItem(
                `coffernode:siwe:declined:${address.toLowerCase()}`,
              )
            }
            disconnect()
          }}
          className="text-red-500 rounded-xl"
        >
          {t('wallet.disconnect')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
