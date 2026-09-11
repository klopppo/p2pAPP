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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useAccount, useChainId, useConnectorClient, useSwitchChain } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  expectedChain,
  expectedChainId,
  expectedChainLabel,
  isOnExpectedChain,
} from '@/lib/chain'

export function ChainGuard() {
  const { t } = useTranslation()
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync, error: switchError, isPending } = useSwitchChain()
  const { data: connectorClient } = useConnectorClient()
  const [adding, setAdding] = useState(false)

  const ok = isOnExpectedChain(chainId) || !isConnected

  // After a successful switch, the wagmi chainId will update and the
  // guard automatically unmounts. No effect needed here.

  if (ok || expectedChainId == null) return null

  const handleSwitch = async () => {
    if (expectedChainId == null) return
    try {
      await switchChainAsync({ chainId: expectedChainId })
    } catch (err) {
      // 4902 = chain not added to the wallet yet. Add it (using the chain's
      // RPC, which the wallet itself dials — CORS is irrelevant here) then
      // retry the switch so MetaMask users don't hit a dead end.
      const code = (err as { code?: number })?.code
      if ((code === 4902 || code === -32603) && expectedChain && connectorClient) {
        try {
          setAdding(true)
          await connectorClient.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${expectedChain.id.toString(16)}`,
                chainName: expectedChain.name,
                nativeCurrency: expectedChain.nativeCurrency,
                rpcUrls: expectedChain.rpcUrls.default.http,
                blockExplorerUrls: expectedChain.blockExplorers?.default?.url
                  ? [expectedChain.blockExplorers.default.url]
                  : undefined,
              },
            ],
          })
          await switchChainAsync({ chainId: expectedChainId })
        } catch (addErr) {
          console.warn('[ChainGuard] wallet_addEthereumChain failed:', addErr)
        } finally {
          setAdding(false)
        }
      }
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
            onClick={() => void handleSwitch()}
            disabled={isPending || adding}
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
