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
const READY_RETRIES = 20
const READY_DELAY_MS = 150

async function waitForConnector(): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < READY_RETRIES; attempt++) {
    try {
      await getConnectorClient(config)
      return
    } catch (err) {
      // Treat ANY failure as transient while wagmi rehydrates the connector:
      // a half-built connector throws `...getChainId is not a function` (the
      // original wevm/wagmi#4216 symptom), and a connector whose provider
      // transport blips throws `Connection interrupted while trying to
      // subscribe` (dropped provider WebSocket). Both recover inside this
      // window (3s), so only give up once it is exhausted instead of failing
      // the sign-in on the first blip.
      lastError = err
      await new Promise((resolve) => setTimeout(resolve, READY_DELAY_MS))
    }
  }
  throw new Error('Wallet connector not ready', { cause: lastError })
}

export async function signWalletMessage({
  message,
}: {
  message: string
}): Promise<Hex> {
  await waitForConnector()
  return signMessage(config, { message })
}