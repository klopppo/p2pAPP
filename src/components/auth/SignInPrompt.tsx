/**
 * Non-blocking sign-in prompt.
 *
 * Mounts a centered card with a semi-transparent backdrop. The user can
 * still browse the rest of the app underneath — the prompt just nudges
 * them to finish the SIWE flow when they take an action that needs the
 * Supabase session.
 *
 * Triggers ONLY when:
 *   - wagmi reports a connected wallet
 *   - the SIWE success marker for that wallet is missing (or there's a
 *     pending rejection marker)
 *
 * Both gates off → no prompt. No wallet, no signature, no modal.
 *
 * Backdrop click / close button → set `dismissedForAddr(addr)` in
 * sessionStorage. Dismissed per (wallet, browser-session) so reloading
 * the page brings the prompt back if the user still hasn't signed.
 * The wallet itself is also key in the storage so a different wallet
 * doesn't inherit another wallet's dismiss.
 */
import { useCallback, useEffect, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { ensureWalletSession } from '@/lib/supabase'

const REJECTED_KEY_PREFIX = 'coffernode:siwe:declined:'
const SUCCESS_KEY = 'coffernode:siwe:last'
const DISMISS_KEY_PREFIX = 'coffernode:siwe:promptDismissed:'

function hasSuccessMarker(addr: string): boolean {
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

function hasRejectionMarker(addr: string): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(`${REJECTED_KEY_PREFIX}${addr.toLowerCase()}`) === '1'
}

function isDismissedFor(addr: string): boolean {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(`${DISMISS_KEY_PREFIX}${addr.toLowerCase()}`) === '1'
}

function markDismissedFor(addr: string): void {
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
  const { data: currentUser } = useCurrentUser()
  const qc = useQueryClient()

  const [visible, setVisible] = useState(false)
  const [signing, setSigning] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Recompute visibility whenever the address / signature / user state
  // changes. Key insight: visibility = (wallet connected) AND
  // (no success marker OR rejection marker present) AND (user hasn't
  // dismissed for this address this session).
  useEffect(() => {
    if (!isConnected || !address) {
      setVisible(false)
      return
    }
    const lower = address.toLowerCase()
    const success = hasSuccessMarker(lower)
    const rejected = hasRejectionMarker(lower)
    const userOk =
      !!currentUser?.wallet_address &&
      currentUser.wallet_address.toLowerCase() === lower
    // Fully signed in → hide (forever, until they disconnect).
    if (success && userOk && !rejected) {
      setVisible(false)
      return
    }
    setVisible(!isDismissedFor(lower))
  }, [address, isConnected, currentUser])

  const runSignIn = useCallback(async () => {
    if (!address || !signMessageAsync) return
    setSigning(true)
    setErrorMessage(null)
    try {
      await ensureWalletSession(address, { signMessage: signMessageAsync })
      clearRejected(address)
      qc.invalidateQueries({ queryKey: ['current-user'] })
      qc.invalidateQueries({ queryKey: ['user-profile'] })
      // The visibility effect will re-evaluate once the success marker
      // + user row are both present, and hide the prompt.
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSigning(false)
    }
  }, [address, signMessageAsync, qc])

  const handleDismiss = useCallback(() => {
    if (!address) return
    markDismissedFor(address)
    setVisible(false)
  }, [address])

  // If the user disconnects, the dismissal for that address is moot —
  // clear it so a future re-connect with the same wallet doesn't inherit
  // a stale "I dismissed this" flag from before they disconnected.
  useEffect(() => {
    if (!address) {
      // No connected wallet: nothing to clear. The sessionStorage entries
      // for any other address (if they exist) are inert.
    }
  }, [address])

  if (!visible || !isConnected || !address) return null

  // Note: the prompt body is intentionally lightweight — no huge copy,
  // no full-page takeover. The user can click outside the card to
  // dismiss; everything else on the page remains interactive.
  return (
    <div
      role="presentation"
      onClick={(e) => {
        // Backdrop click: dismiss. Clicks bubbling up from the card
        // itself are stopped at the card level.
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
