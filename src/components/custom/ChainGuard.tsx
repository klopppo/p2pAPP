/**
 * Wrong-chain banner: auto-attempts a switch on connect and offers a manual
 * retry (with `wallet_addEthereumChain` fallback) when that fails.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
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
  const autoAttemptedFor = useRef<number | null>(null)

  const ok = isOnExpectedChain(chainId) || !isConnected

  const switchToExpectedChain = useCallback(async () => {
    if (expectedChainId == null) return
    try {
      await switchChainAsync({ chainId: expectedChainId })
    } catch (err) {
      // 4902/-32603 = chain unknown to the wallet; add it, then retry the switch.
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
  }, [switchChainAsync, connectorClient])

  // Auto-switch once per mismatched wallet chain. On success the `chainId`
  // change re-renders and the banner never appears; on rejection the banner
  // stays (manual retry / guidance). The effect doesn't re-run while both
  // `ok` and `chainId` are unchanged, so a rejection can't cause a loop.
  useEffect(() => {
    if (ok || expectedChainId == null) {
      autoAttemptedFor.current = null
      return
    }
    if (autoAttemptedFor.current === chainId) return
    autoAttemptedFor.current = chainId
    void switchToExpectedChain()
  }, [ok, chainId, switchToExpectedChain])

  if (ok || expectedChainId == null) return null

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
            onClick={() => void switchToExpectedChain()}
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
