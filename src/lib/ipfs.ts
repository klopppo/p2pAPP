import { createHelia, type Helia } from 'helia'
import { unixfs, type UnixFS } from '@helia/unixfs'

// Public gateway used to build shareable links. Override via .env
// (VITE_IPFS_GATEWAY) when using a custom/pinning-service gateway.
const GATEWAY = import.meta.env.VITE_IPFS_GATEWAY ?? 'https://ipfs.io/ipfs/'

let heliaPromise: Promise<{ helia: Helia; fs: UnixFS }> | null = null
let inflightUploads = 0
let teardownPromise: Promise<void> | null = null

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
  inflightUploads++
  try {
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
  } finally {
    inflightUploads--
  }
}

/** Pre-warm the Helia node (call on app idle) so first upload isn't slow. */
export function warmUpIpfs() {
  getNode().catch((err) => {
    // Warm-up is best-effort; surface the failure so the first real upload
    // isn't a silent surprise. The node will be retried lazily on demand.
    console.warn('[IPFS] warm-up failed:', err)
  })
}

/**
 * Stop the Helia node (call on logout / teardown).
 *
 * Waits for any in-flight uploads to finish before `helia.stop()`; tearing the
 * node down mid-`addBytes` aborts the write and can leave the caller believing
 * an evidence CID landed in the network when it never propagated. Uploads are
 * bounded by a 30s grace wait so a degenerate hang can't block logout forever.
 */
export async function teardownIpfs(): Promise<void> {
  if (!teardownPromise) {
    teardownPromise = (async () => {
      const pending = heliaPromise
      heliaPromise = null
      if (!pending) return
      const deadline = Date.now() + 30_000
      while (inflightUploads > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      const { helia } = await pending
      await helia.stop()
    })().finally(() => {
      teardownPromise = null
    })
  }
  return teardownPromise
}
