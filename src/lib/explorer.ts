/**
 * Block-explorer base URLs.
 *
 * Every link goes through `blockscan.com` — Etherscan's multi-chain resolver —
 * which routes an address / tx / token to the correct chain explorer. This
 * avoids chain-specific hardcoding (`etherscan.io` vs `sepolia.etherscan.io`)
 * and behaves for any EVM chain the app deploys to.
 */

const BLOCKSCAN = 'https://blockscan.com'

export const explorerBase: { address: string; tx: string; token: string } = {
  address: `${BLOCKSCAN}/address/`,
  tx: `${BLOCKSCAN}/tx/`,
  token: `${BLOCKSCAN}/token/`,
}
