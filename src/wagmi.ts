import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { mainnet, sepolia, type Chain } from 'wagmi/chains'

/**
 * Validate that `VITE_EXPECTED_CHAIN_ID` matches a chain the wagmi config
 * actually supports. If the env var is set to a chain we haven't added
 * below, the `switchChain()` call from ChainGuard will silently fail with
 * "Chain not configured." catching that early means the developer can
 * fix it instead of debugging a confusing revert downstream.
 */
const expectedChainIdEnv = import.meta.env.VITE_EXPECTED_CHAIN_ID?.trim()
const expectedChainId = expectedChainIdEnv ? Number(expectedChainIdEnv) : null

const SUPPORTED_CHAINS = [mainnet, sepolia] as const

if (
  expectedChainId != null &&
  Number.isFinite(expectedChainId) &&
  expectedChainId > 0 &&
  !SUPPORTED_CHAINS.some((c) => c.id === expectedChainId)
) {
  console.error(
    `[wagmi] VITE_EXPECTED_CHAIN_ID=${expectedChainId} is not in the supported chains ` +
      `list (${SUPPORTED_CHAINS.map((c) => `${c.id}=${c.name}`).join(', ')}). ` +
      `Add the missing chain to src/wagmi.ts or pick a supported id.`,
  )
}

/**
 * WalletConnect project id.
 *
 * Required for WalletConnect (mobile wallets, QR pairing, WC-based flows) to
 * connect across browsers. Create a free project at
 * https://cloud.walletconnect.com and set its id as `VITE_WC_PROJECT_ID` in
 * your .env (project ids are public by design and safe to ship in client
 * bundles).
 *
 * Until a real id is set we fall back to a non-empty placeholder so the app
 * still runs and *injected* browser-extension wallets (e.g. the MetaMask
 * extension) can connect; only the WalletConnect/mobile/QR paths need the
 * real id. RainbowKit throws and white-screens the app if projectId is empty,
 * so the fallback must stay non-empty.
 */
const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim() || undefined

if (!projectId) {
  console.warn(
    '[wagmi] VITE_WC_PROJECT_ID not set. Injected wallets (MetaMask etc.) still work; ' +
      'WalletConnect/mobile/QR need a real id from https://cloud.walletconnect.com ' +
      'set as VITE_WC_PROJECT_ID in .env.',
  )
}

export const config = getDefaultConfig({
  appName: 'CofferNode',
  // Non-empty placeholder keeps getDefaultConfig from throwing when the env var
  // is unset. Replace with a real id to enable WalletConnect/mobile/QR flows.
  projectId: projectId || 'demo-project-id',
  appDescription: 'CofferNode — trustless peer-to-peer crypto exchange',
  appUrl: import.meta.env.VITE_APP_URL ?? 'http://localhost:5173',
  chains: SUPPORTED_CHAINS as unknown as readonly [Chain, ...Chain[]],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
})

/**
 * Surface the deployed-factory chain early so the ChainGuard banner can
 * read it. We keep this list intentionally small (the two chains the
 * factory ever ships to); adding Polygon etc. means importing more wagmi
 * chains here AND setting `VITE_EXPECTED_CHAIN_ID` to that network.
 */
export const supportedChainIds = new Set<number>(SUPPORTED_CHAINS.map((c) => c.id))
