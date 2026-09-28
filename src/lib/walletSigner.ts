import type { Hex } from 'viem'
import { getConnectorClient, signMessage } from 'wagmi/actions'
import { config } from '@/wagmi'

/**
 * Sign an SIWE challenge with the connected wallet, waiting out wagmi's
 * connector rehydration window. On reload `isConnected` flips instantly from
 * persisted state while the connector re-attaches async; signing inside that
 * window throws `connection.connector.getChainId is not a function`
 * (wevm/wagmi#4216). Re-check LIVE readiness at call time and retry for ~3s.
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
      // A half-built connector or a blipped provider transport both recover
      // inside this window — only give up once it is exhausted.
      lastError = err
      await new Promise((resolve) => setTimeout(resolve, READY_DELAY_MS))
    }
  }
  throw new Error('Wallet connector not ready', { cause: lastError })
}

export async function signWalletMessage({ message }: { message: string }): Promise<Hex> {
  await waitForConnector()
  return signMessage(config, { message })
}
