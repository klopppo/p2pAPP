import { createHelia, type Helia } from 'helia'
import { unixfs, type UnixFS } from '@helia/unixfs'

// Public gateway used to build shareable links. Override via .env
// (VITE_IPFS_GATEWAY) when using a custom/pinning-service gateway.
const GATEWAY = import.meta.env.VITE_IPFS_GATEWAY ?? 'https://ipfs.io/ipfs/'

let heliaPromise: Promise<{ helia: Helia; fs: UnixFS }> | null = null

/** Lazily create a single in-browser Helia node + UnixFS (expensive, reuse). */
async function getNode() {
  if (!heliaPromise) {
    heliaPromise = createHelia().then((helia) => ({ helia, fs: unixfs(helia) }))
  }
  return heliaPromise
}

export interface IpfsUploadResult {
  /** Raw CID (v0/v1) of the uploaded content */
  cid: string
  /** Resolvable gateway URL */
  url: string
  size: number
  name: string
}

/**
 * Upload a File/Blob to IPFS via the in-browser Helia node and return its CID
 * plus a public gateway link.
 *
 * NOTE: a browser Helia node publishes the CID over Bitswap but does NOT pin it
 * to a public provider on its own. For guaranteed long-term retrieval, pair this
 * with a pinning service (Pinata / web3.storage / nft.storage) or a dedicated
 * gateway — set VITE_IPFS_GATEWAY to point at one.
 */
export async function uploadToIpfs(
  file: File | Blob,
  name = (file as File).name ?? 'file',
): Promise<IpfsUploadResult> {
  const { fs } = await getNode()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const cid = await fs.addBytes(bytes)
  const cidStr = cid.toString()
  return {
    cid: cidStr,
    url: `${GATEWAY}${cidStr}`,
    size: bytes.byteLength,
    name,
  }
}

/** Pre-warm the Helia node (call on app idle) so first upload isn't slow. */
export function warmUpIpfs() {
  void getNode()
}

/** Stop the Helia node (call on logout / teardown). */
export async function teardownIpfs() {
  if (!heliaPromise) return
  const { helia } = await heliaPromise
  await helia.stop()
  heliaPromise = null
}
