/**
 * Sign-in gate — full-screen modal that blocks the rest of the `/app/*`
 * routes until the user has signed a SIWE message with their connected
 * wallet. Once accepted, the result is persisted by `signInWithWallet` to
 * the `coffernode:siwe:last` localStorage marker; on next visit the gate
 * sees the marker and opens the app immediately. If the user declines,
 * `ensureWalletSession` writes `coffernode:siwe:declined:<addr>` and
 * subsequent visits skip the prompt — the gate stays in "declined"
 * state until the user clicks "Try again".
 *
 * Behaviour summary:
 *   1. Wallet not connected → "Connect wallet to continue" with the
 *      RainbowKit trigger button.
 *   2. Wallet connected, marker exists → gate unmounts, children render.
 *   3. Wallet connected, no marker, no rejection → auto-prompt on mount
 *      so the user sees the SIWE popup exactly once per browser+wallet.
 *   4. Wallet connected, previously declined → show a "Try again" CTA.
 *
 * The gate does NOT manage the Supabase auth session itself — it relies on
 * the existing `useSyncUser` hook + `ensureWalletSession` plumbing. The
 * only thing the gate contributes is the visual lockout + the explicit
 * "Connect wallet" affordance (RainbowKit's ConnectButton only renders in
 * the navbar, which this gate covers).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useConnectors, useSignMessage } from 'wagmi'
import type { Connector } from '@wagmi/core'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, ShieldCheck, Wallet, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { ensureWalletSession } from '@/lib/supabase'

const REJECTED_KEY_PREFIX = 'coffernode:siwe:declined:'
const SUCCESS_KEY = 'coffernode:siwe:last'

function hadSuccessFor(addr: string): boolean {
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

function hadRejected(addr: string): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(`${REJECTED_KEY_PREFIX}${addr.toLowerCase()}`) === '1'
}

function clearRejected(addr: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(`${REJECTED_KEY_PREFIX}${addr.toLowerCase()}`)
}

interface SiweGateProps {
  children: React.ReactNode
}

export function SiweGate({ children }: SiweGateProps) {
  const { t } = useTranslation()
  const { address, isConnected, status: wagmiStatus } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const qc = useQueryClient()

  // Pick the first injected connector to trigger RainbowKit programmatically
  // — UI for "Connect wallet" is the rainbowkit modal that fires when we
  // call connector.connect(). If you want the full RainbowKit picker UI
  // (WalletConnect, Coinbase, etc.), use the ConnectButton in the navbar
  // — this CTA only triggers whichever injected wallet the user has.
  const connectors = useConnectors()
  const injectedConnector = useMemo<Connector | undefined>(
    () => connectors.find((c) => c.type === 'injected') ?? connectors[0],
    [connectors],
  )

  const [state, setState] = useState<
    'idle' | 'signing' | 'declined' | 'connecting' | 'error'
  >('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Whether the user has been signed in for the currently connected wallet
  // in this browser. Two sources of truth:
  //   - the `coffernode:siwe:last` marker (set after every successful SIWE)
  //   - the `users` row Supabase resolves after the session is established
  // Both must agree before we let the rest of the app render.
  const markerOk = address ? hadSuccessFor(address) : false
  const userOk = !!currentUser?.wallet_address
  const userMatchesAddr =
    !!currentUser?.wallet_address &&
    !!address &&
    currentUser.wallet_address.toLowerCase() === address.toLowerCase()
  const rejected = !!address && hadRejected(address)
  const admitted = markerOk && userOk && userMatchesAddr && !rejected

  // Fire the SIWE pop on first connect (the marker exists only AFTER the
  // first successful sign — without this auto-prompt the user would see an
  // empty gate forever). The previous-rejection case is *not* auto-prompted
  // because that's the literal anti-pattern the rejection marker exists to
  // prevent.
  useEffect(() => {
    if (!isConnected || !address || admitted) return
    if (rejected) return
    if (!signMessageAsync) return
    if (state !== 'idle') return
    void runSignIn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, admitted, rejected])

  const runSignIn = useCallback(async () => {
    if (!address || !signMessageAsync) return
    setState('signing')
    setErrorMessage(null)
    try {
      await ensureWalletSession(address, { signMessage: signMessageAsync })
      clearRejected(address)
      // The Supabase `users` row is now guaranteed to exist; trigger a
      // refetch so the rest of the app sees the logged-in user immediately.
      qc.invalidateQueries({ queryKey: ['user'] })
      qc.invalidateQueries({ queryKey: ['user-profile'] })
      setState('idle')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(msg)
      setState('declined')
    }
  }, [address, signMessageAsync, qc])

  const handleConnect = async () => {
    if (!injectedConnector) return
    setState('connecting')
    setErrorMessage(null)
    try {
      await injectedConnector.connect()
      // After connect, the wagmiStatus flips to 'connected' and the
      // effect above auto-fires runSignIn — we don't need to call it here.
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  const handleRetry = () => {
    clearRejected(address ?? '')
    void runSignIn()
  }

  // Decisive: once admitted, render the children and stop here. The gate
  // is intentionally all-or-nothing — a partly-rendered tree behind a
  // modal would still leak page-level fetches.
  if (admitted) return <>{children}</>

  // State machine for the modal copy.
  let icon: React.ReactNode = <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
  let title = t('signInGate.signingTitle', {
    defaultValue: 'Signing you in…',
  })
  let body: React.ReactNode = null
  let action: React.ReactNode = null

  if (!isConnected) {
    icon = <Wallet className="w-10 h-10 text-primary" />
    title = t('signInGate.connectTitle', {
      defaultValue: 'Connect your wallet to continue',
    })
    body = (
      <Text variant="muted">
        {t('signInGate.connectBody', {
          defaultValue:
            'CofferNode uses Sign-In With Ethereum. Connect a wallet to sign in — your address stays in your control.',
        })}
      </Text>
    )
    action = (
      <Button
        size="lg"
        onClick={handleConnect}
        disabled={!injectedConnector || state === 'connecting'}
        className="rounded-full px-8 shadow-none"
      >
        <Wallet className="w-4 h-4 mr-2" />
        {state === 'connecting'
          ? t('signInGate.connecting', { defaultValue: 'Connecting…' })
          : t('signInGate.connectCta', { defaultValue: 'Connect wallet' })}
      </Button>
    )
  } else if (rejected || state === 'declined') {
    icon = <X className="w-10 h-10 text-destructive" />
    title = t('signInGate.declinedTitle', {
      defaultValue: 'Sign-in required',
    })
    body = (
      <>
        <Text variant="muted">
          {t('signInGate.declinedBody', {
            defaultValue:
              "You declined the sign-in message. CofferNode needs your signature to load your trades and chats — try again when you're ready.",
          })}
        </Text>
        {errorMessage && (
          <Text variant="small" className="text-destructive">
            {errorMessage}
          </Text>
        )}
      </>
    )
    action = (
      <Button
        size="lg"
        onClick={handleRetry}
        disabled={state === 'signing'}
        className="rounded-full px-8 shadow-none"
      >
        {state === 'signing'
          ? t('signInGate.signing', { defaultValue: 'Signing…' })
          : t('signInGate.retryCta', { defaultValue: 'Try again' })}
      </Button>
    )
  } else if (state === 'error') {
    icon = <X className="w-10 h-10 text-destructive" />
    title = t('signInGate.errorTitle', { defaultValue: 'Sign-in failed' })
    body = (
      <Text variant="muted">
        {errorMessage ?? t('signInGate.errorBody', { defaultValue: 'Try again.' })}
      </Text>
    )
    action = (
      <Button size="lg" onClick={() => void runSignIn()} className="rounded-full px-8 shadow-none">
        {t('signInGate.retryCta', { defaultValue: 'Try again' })}
      </Button>
    )
  } else if (state === 'connecting') {
    icon = <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
    title = t('signInGate.connecting', { defaultValue: 'Connecting…' })
  } else if (wagmiStatus === 'reconnecting' || userLoading) {
    icon = <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
    title = t('signInGate.reconnecting', { defaultValue: 'Restoring session…' })
  } else if (state === 'signing') {
    icon = <ShieldCheck className="w-10 h-10 text-primary" />
    title = t('signInGate.siweTitle', {
      defaultValue: 'Approve the signature in your wallet',
    })
    body = (
      <Text variant="muted">
        {t('signInGate.siweBody', {
          defaultValue:
            'A small one-time signature. We never send transactions from this prompt and never touch your funds.',
        })}
      </Text>
    )
  } else {
    // Connected, no marker yet, no rejection — the auto-prompt effect
    // above will fire momentarily; show a generic loading state until
    // the pop appears.
    icon = <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
    title = t('signInGate.preparingTitle', {
      defaultValue: 'Preparing sign-in…',
    })
  }

  return (
    <>
      {/* The rest of the app underneath the gate would still receive
          effects + queries if rendered. Don't render it until admitted. */}
      {admitted ? children : null}
      {!admitted && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="siwe-gate-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl p-4"
        >
          <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card/95 shadow-2xl backdrop-blur-md p-8 flex flex-col items-center text-center gap-4">
            {icon}
            <Text as="h2" id="siwe-gate-title" variant="h3" className="leading-tight">
              {title}
            </Text>
            {body}
            {action}
          </div>
        </div>
      )}
    </>
  )
}
