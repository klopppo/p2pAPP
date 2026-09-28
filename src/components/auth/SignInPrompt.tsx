/**
 * Non-blocking SIWE sign-in card; visible only for a connected wallet with no
 * session and no success/rejection/dismissal marker for that wallet.
 */
import { useCallback, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { ensureWalletSession } from '@/lib/supabase'
import { useWalletSession } from '@/hooks/useWalletSession'

const REJECTED_KEY_PREFIX = 'coffernode:siwe:declined:'
const DISMISS_KEY_PREFIX = 'coffernode:siwe:promptDismissed:'
const SUCCESS_KEY = 'coffernode:siwe:last'

function hasRejection(addr: string): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(`${REJECTED_KEY_PREFIX}${addr.toLowerCase()}`) === '1'
}

/** This device already completed SIWE for `addr` — don't auto-prompt again. */
function hasSignedInMarker(addr: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(SUCCESS_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { address?: string }
    return parsed?.address?.toLowerCase() === addr.toLowerCase()
  } catch {
    return false
  }
}

function isDismissed(addr: string): boolean {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(`${DISMISS_KEY_PREFIX}${addr.toLowerCase()}`) === '1'
}

function markDismissed(addr: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(`${DISMISS_KEY_PREFIX}${addr.toLowerCase()}`, '1')
}

function clearRejected(addr: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(`${REJECTED_KEY_PREFIX}${addr.toLowerCase()}`)
}

export function SignInPrompt() {
  const { t } = useTranslation()
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { hasSession } = useWalletSession()
  const qc = useQueryClient()

  const [signing, setSigning] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Bumped after each attempt/dismissal so the derived `visible` re-reads the
  // freshly-written storage markers. The value itself is unused.
  const [, setSignAttempts] = useState(0)

  // Visibility is derived during render from address, session, and storage
  // markers — never auto-prompt MetaMask on reload.
  const lowerAddress = address?.toLowerCase() ?? null
  const visible =
    isConnected &&
    !!lowerAddress &&
    !hasSession &&
    !hasSignedInMarker(lowerAddress) &&
    !hasRejection(lowerAddress) &&
    !isDismissed(lowerAddress)

  const runSignIn = useCallback(async () => {
    if (!address || !signMessageAsync) return
    setSigning(true)
    setErrorMessage(null)
    try {
      const { session } = await ensureWalletSession(address, {
        signMessage: signMessageAsync,
        force: true,
      })
      // `ensureWalletSession` returns `session: false` instead of throwing;
      // only a real success may clear the durable rejection marker.
      if (!session) {
        setErrorMessage(t('signInPrompt.failed', {
          defaultValue: 'Sign-in was not completed. Please try again.',
        }))
        return
      }
      clearRejected(address)
      qc.invalidateQueries({ queryKey: ['wallet-session'] })
      qc.invalidateQueries({ queryKey: ['current-user'] })
      qc.invalidateQueries({ queryKey: ['user-profile'] })
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSigning(false)
      // Always bump the attempt counter so the next render picks up the
      // freshly-written success / rejection markers.
      setSignAttempts((n) => n + 1)
    }
  }, [address, signMessageAsync, qc, t])

  const handleDismiss = useCallback(() => {
    if (!address) return
    markDismissed(address)
    setSignAttempts((n) => n + 1)
  }, [address])

  if (!visible || !isConnected || !address) return null

  return (
    <div
      role="presentation"
      onClick={(e) => {
        // Backdrop click dismisses; card clicks are stopped below.
        if (e.target === e.currentTarget) handleDismiss()
      }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/40 backdrop-blur-sm p-4"
    >
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="signin-prompt-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-border/60 bg-card shadow-2xl p-6 flex flex-col gap-3"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-primary mt-0.5 shrink-0" />
          <div className="flex-1">
            <Text as="h3" id="signin-prompt-title" variant="h4" className="leading-tight">
              {t('signInPrompt.title', { defaultValue: 'Sign in to continue' })}
            </Text>
            <Text variant="small" className="text-muted-foreground mt-1">
              {t('signInPrompt.body', {
                defaultValue:
                  'Your wallet is connected but the sign-in message is still pending. Sign in to load your trades and chats.',
              })}
            </Text>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t('signInPrompt.dismiss', { defaultValue: 'Dismiss' })}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {errorMessage && (
          <Text variant="small" className="text-destructive">
            {errorMessage}
          </Text>
        )}
        <div className="flex items-center gap-2 justify-end pt-1">
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="rounded-full px-4"
          >
            {t('signInPrompt.later', { defaultValue: 'Later' })}
          </Button>
          <Button
            onClick={() => void runSignIn()}
            disabled={signing}
            className="rounded-full px-5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-none"
          >
            {signing
              ? t('signInPrompt.signing', { defaultValue: 'Signing…' })
              : t('signInPrompt.signCta', { defaultValue: 'Sign message' })}
          </Button>
        </div>
      </div>
    </div>
  )
}
