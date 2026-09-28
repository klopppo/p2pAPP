/**
 * Block-explorer URLs via blockscan.com — Etherscan's multi-chain resolver —
 * so addresses / txs / tokens route to the right explorer without hardcoding
 * chain-specific hosts.
 */

const BLOCKSCAN = 'https://blockscan.com'

export const explorerBase: { address: string; tx: string; token: string } = {
  address: `${BLOCKSCAN}/address/`,
  tx: `${BLOCKSCAN}/tx/`,
  token: `${BLOCKSCAN}/token/`,
}
