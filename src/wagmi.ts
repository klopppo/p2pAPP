import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'

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
    '[wagmi] VITE_WC_PROJECT_ID non impostato. I wallet iniettati ' +
      '(estensione browser, es. MetaMask) funzionano comunque; per i wallet ' +
      'mobile/QR/WalletConnect serve un id reale da ' +
      'https://cloud.walletconnect.com da mettere in .env come VITE_WC_PROJECT_ID.',
  )
}

export const config = getDefaultConfig({
  appName: 'P2P Crypto',
  // Non-empty placeholder keeps getDefaultConfig from throwing when the env var
  // is unset. Replace with a real id to enable WalletConnect/mobile/QR flows.
  projectId: projectId || 'demo-project-id',
  appDescription: 'P2P Crypto — peer-to-peer crypto trading',
  appUrl: import.meta.env.VITE_APP_URL ?? 'http://localhost:5173',
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
})
