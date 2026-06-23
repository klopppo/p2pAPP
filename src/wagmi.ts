import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'

export const config = getDefaultConfig({
  appName: 'P2P Crypto',
  projectId: 'demo-project-id',
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
})
