/**
 * SIWE sign-in gate — full-screen modal that blocks the rest of the
 * `/app/*` routes until the user has signed a SIWE message with their
 * connected wallet. The modal NEVER disappears mid-flow: it stays
 * mounted through "connect wallet" → "click to sign" → MetaMask popup
 * → "admitted", then collapses once. The two state machines (modal
 * state + admitted boolean) are decoupled so the underlying React
 * subtree (children) only mounts after BOTH wallet + signature are
 * present — Supabase queries (via useCurrentUser, gated on `isConnected`)
 * don't run before that.
 *
 * Persistence (lives forever, until explicit signOut):
 *   - `coffernode:siwe:last`            = { address, issuedAt } on success
 *   - `coffernode:siwe:declined:<addr>`  = '1' on user dismissal
 *
 * Re-admission on same browser requires a successful sign-in once. No
 * auto-prompt if the marker is present. "Try again" is the only way
 * back to a prompt if the user previously declined. The user can also
 * disconnect from their wallet (or sign out) to clear all markers and
 * start fresh.
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

/**
 * Phases the gate can be in. `connect` is a sub-state of "no wallet yet";
 * `sign` means "wallet connected, signature requested"; `declined` means
 * the user previously dismissed the prompt and is sitting on the
 * Try-again screen; `error` is a hard failure. The modal stays mounted
 * across all of these — only `admitted=true` hides it.
 */
type Phase = 'connect' | 'sign' | 'declined' | 'error' | 'restoring'

export function SiweGate({ children }: SiweGateProps) {
  const { t } = useTranslation()
  const { address, isConnected, status: wagmiStatus } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { data: currentUser } = useCurrentUser()
  const qc = useQueryClient()

  const connectors = useConnectors()
  const injectedConnector = useMemo<Connector | undefined>(
    () => connectors.find((c) => c.type === 'injected') ?? connectors[0],
    [connectors],
  )

  const [phase, setPhase] = useState<Phase>('restoring')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [inFlight, setInFlight] = useState(false)

  // Resolve admission. Read both markers BEFORE evaluating currentUser so
  // a stale cached user doesn't admit a wallet that no longer matches the
  // marker.
  const lowerAddr = address?.toLowerCase()
  const markerOk = lowerAddr ? hadSuccessFor(lowerAddr) : false
  const rejected = lowerAddr ? hadRejected(lowerAddr) : false
  const userOk = !!currentUser?.wallet_address
  const userMatchesAddr =
    !!currentUser?.wallet_address &&
    !!lowerAddr &&
    currentUser.wallet_address.toLowerCase() === lowerAddr
  const admitted = markerOk && userOk && userMatchesAddr && !rejected

  // Re-derive the visual phase from current state. We do NOT mutate phase
  // from the signature promise resolution — instead we wait for the
  // `markerOk` / `userOk` flags to flip after the Supabase write, which
  // collapses the modal and re-renders children. This is what keeps the
  // modal from "disappearing while the signature is being asked" — it
  // stays mounted through the entire transaction, with its body
  // reflecting what the user is expected to do (or wait for).
  useEffect(() => {
    if (admitted) return // happy path — modal collapses, nothing to do
    if (!isConnected || !lowerAddr) {
      if (phase !== 'restoring') setPhase('restoring')
      return
    }
    if (rejected) {
      if (phase !== 'declined') setPhase('declined')
      return
    }
    if (inFlight) {
      if (phase !== 'sign') setPhase('sign')
      return
    }
    // Connected, no marker, not rejected, not in flight — sit on the
    // 'sign' phase, which renders a button the user has to click. The
    // explicit-click flow avoids the MetaMask popup appearing
    // uninvited the moment the page mounts.
    if (phase !== 'sign') setPhase('sign')
  }, [admitted, isConnected, lowerAddr, rejected, inFlight, phase])

  const runSignIn = useCallback(async () => {
    if (!address || !signMessageAsync) return
    if (inFlight) return
    setInFlight(true)
    setErrorMessage(null)
    try {
      await ensureWalletSession(address, { signMessage: signMessageAsync })
      clearRejected(address)
      // The Supabase `users` row is now guaranteed to exist; trigger a
      // refetch so the rest of the app sees the logged-in user
      // immediately (the gate's `admitted` flag is reactive on this
      // query's data).
      qc.invalidateQueries({ queryKey: ['current-user'] })
      qc.invalidateQueries({ queryKey: ['user-profile'] })
      setInFlight(false)
      // Phase will flip off 'sign' automatically because markerOk /
      // userOk become true → admitted=true → children render → modal
      // unmounts via the {admitted ? children : null} branch.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(msg)
      setInFlight(false)
      // Any failure (rejection, throttle, backend error, etc.) is
      // recorded by ensureWalletSession → reads back via the
      // `rejected` flag → flips phase to 'declined' on the next render.
      setPhase('declined')
    }
  }, [address, signMessageAsync, inFlight, qc])

  const handleConnect = useCallback(async () => {
    if (!injectedConnector) return
    setErrorMessage(null)
    try {
      await injectedConnector.connect()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }, [injectedConnector])

  // "Try again" clears the rejected marker and re-enters the sign flow.
  const handleRetry = useCallback(() => {
    if (!address) return
    clearRejected(address)
    setPhase('sign')
    setErrorMessage(null)
    void runSignIn()
  }, [address, runSignIn])

  // Once admitted, render the children and STOP — the modal must never
  // flicker behind a partially-rendered tree.
  if (admitted) return <>{children}</>

  // ── Modal contents per phase ─────────────────────────────────────────
  // The body of the modal is intentionally minimal: one icon, one title,
  // one short body, at most one button. We avoid swapping in different
  // copy mid-flow to keep the transition stable.
  let icon: React.ReactNode
  let title: string
  let body: React.ReactNode = null
  let button: React.ReactNode = null

  if (!isConnected || !lowerAddr || phase === 'restoring') {
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
    button = (
      <Button
        size="lg"
        onClick={handleConnect}
        disabled={!injectedConnector}
        className="rounded-full px-8 shadow-none"
      >
        <Wallet className="w-4 h-4 mr-2" />
        {t('signInGate.connectCta', { defaultValue: 'Connect wallet' })}
      </Button>
    )
  } else if (phase === 'declined' || rejected) {
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
    button = (
      <Button
        size="lg"
        onClick={handleRetry}
        className="rounded-full px-8 shadow-none"
      >
        {t('signInGate.retryCta', { defaultValue: 'Try again' })}
      </Button>
    )
  } else if (phase === 'error') {
    icon = <X className="w-10 h-10 text-destructive" />
    title = t('signInGate.errorTitle', { defaultValue: 'Sign-in failed' })
    body = (
      <Text variant="muted">
        {errorMessage ?? t('signInGate.errorBody', { defaultValue: 'Try again.' })}
      </Text>
    )
    button = (
      <Button size="lg" onClick={handleRetry} className="rounded-full px-8 shadow-none">
        {t('signInGate.retryCta', { defaultValue: 'Try again' })}
      </Button>
    )
  } else {
    // Phase === 'sign' or transient while we wait for the success
    // marker + user row to arrive.
    if (wagmiStatus === 'reconnecting') {
      icon = <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      title = t('signInGate.reconnecting', { defaultValue: 'Restoring session…' })
    } else if (inFlight) {
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
      icon = <ShieldCheck className="w-10 h-10 text-primary" />
      title = t('signInGate.signingTitle', {
        defaultValue: 'Sign in to continue',
      })
      body = (
        <Text variant="muted">
          {t('signInGate.siweBody', {
            defaultValue:
              'A small one-time signature. We never send transactions from this prompt and never touch your funds.',
          })}
        </Text>
      )
      button = (
        <Button
          size="lg"
          onClick={() => void runSignIn()}
          className="rounded-full px-8 shadow-none"
        >
          <ShieldCheck className="w-4 h-4 mr-2" />
          {t('signInGate.signCta', { defaultValue: 'Sign message' })}
        </Button>
      )
    }
  }

  return (
    <>
      {/* Don't render children at all when not admitted. This is what
          blocks Supabase queries on the rest of the tree: every page
          below this gate does its own useCurrentUser, but those queries
          are short-circuited by `enabled: isConnected && !!address` —
          however the page-level data fetching (offers, trades, chats)
          ALSO has its own useEffect/useQuery and we don't want them
          mounting behind a modal. So we don't even render the
          children subtree until both wallet + signature are present. */}
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
            {button}
          </div>
        </div>
      )}
    </>
  )
}
