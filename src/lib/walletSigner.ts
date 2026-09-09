import type { Hex } from 'viem'
import { getConnectorClient, signMessage } from 'wagmi/actions'
import { config } from '@/wagmi'

/**
 * Sign an SIWE challenge with the connected wallet, waiting out wagmi's
 * connector rehydration window.
 *
 * On page reload with a previously-connected wallet, `useAccount()` flips
 * `isConnected` instantly (from persisted state) while wagmi asynchronously
 * re-attaches the connector behind the scenes. Paying via the hook's
 * `signMessageAsync` inside that window hits a half-built connector and
 * throws `connection.connector.getChainId is not a function` (see
 * wevm/wagmi#4216, rainbow-me/rainbowkit#2063). Other triggers: the browser
 * wallet silently signing out, or a stale connection object.
 *
 * Instead of trusting render-time hook state, this re-checks LIVE connector
 * readiness via `getConnectorClient` at call time and retries the check for a
 * short window before signing — the same fix recommended by wagmi maintainers
 * for every "sign/write right after connect" path.
 */
const READY_RETRIES = 10
const READY_DELAY_MS = 150

async function waitForConnector(): Promise<void> {
  for (let attempt = 0; attempt < READY_RETRIES; attempt++) {
    try {
      await getConnectorClient(config)
      return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('getChainId')) throw err
      await new Promise((resolve) => setTimeout(resolve, READY_DELAY_MS))
    }
  }
  throw new Error('Wallet connector not ready')
}

export async function signWalletMessage({
  message,
}: {
  message: string
}): Promise<Hex> {
  await waitForConnector()
  return signMessage(config, { message })
}