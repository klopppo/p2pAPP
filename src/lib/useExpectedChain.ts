/**
 * Hook + helper for the "is the wallet on the expected chain?" check.
 * Split from `ChainGuard.tsx` (which exports a React component) so the
 * `react-refresh/only-export-components` rule can fast-refresh cleanly.
 *
 * The component variant is purely visual; this is the data side of the
 * same check and is used by catch-blocks that want to suppress the
 * "transaction reverted" toast when the actual cause is a wrong-network
 * tx.
 */
import { useChainId } from 'wagmi'
import {
  expectedChain,
  expectedChainId,
  isOnExpectedChain,
} from './chain'

export function useIsOnExpectedChain(): boolean {
  const chainId = useChainId()
  return isOnExpectedChain(chainId)
}

// Re-export the chain descriptor so the rare consumer that needs to call
// `wallet_addEthereumChain` can read it without importing wagmi/chains.
export { expectedChain, expectedChainId }
