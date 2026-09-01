/**
 * Banner shown at the top of the app when the connected wallet is on the
 * wrong EVM chain. Clicking the CTA calls `wallet_switchEthereumChain`
 * (handled by RainbowKit/wagmi).
 *
 * Behaviour mirrors checklist item §2 "Network/Chain ID Mismatch":
 * without this guard every `writeContractAsync` against the deployed
 * factory silently reverts with no useful copy. Mounted once at the top
 * of the route tree via AppLayout so all in-app pages are covered,
 * including the detailed trade/dispute views.
 */
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  expectedChainId,
  expectedChainLabel,
  isOnExpectedChain,
} from '@/lib/chain'

export function ChainGuard() {
  const { t } = useTranslation()
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, error: switchError, isPending, variables } = useSwitchChain()

  const ok = isOnExpectedChain(chainId) || !isConnected

  // After a successful switch, the wagmi chainId will update and the
  // guard automatically unmounts. No effect needed here.

  if (ok || expectedChainId == null) return null

  const handleSwitch = () => {
    if (expectedChainId == null) return
    try {
      switchChain({ chainId: expectedChainId })
    } catch (_err) {
      console.warn('[ChainGuard.tsx] _err:', _err)// wagmi throws if the wallet doesn't support wallet_switchEthereumChain
      // (rare; some injected wallets). The error is surfaced via `switchError`.
    }
  }

  return (
    <div className="px-4 md:px-6 pt-3">
      <Alert className="rounded-2xl border-destructive/40 bg-destructive/5 text-destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle>{t('chainGuard.title')}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {t('chainGuard.description', {
              chain: expectedChainLabel ?? String(expectedChainId),
            })}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSwitch}
            disabled={isPending || (variables != null)}
            className="rounded-full shadow-none border-destructive/40 text-destructive"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
            {t('chainGuard.switchCta', {
              chain: expectedChainLabel ?? `chain ${expectedChainId}`,
            })}
          </Button>
        </AlertDescription>
        {switchError && (
          <p className="text-xs mt-2">{t('chainGuard.switchError', { message: switchError.message })}</p>
        )}
      </Alert>
    </div>
  )
}
