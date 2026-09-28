/**
 * Dispute evidence upload helper. Uploads go to Supabase Storage (not an IPFS
 * node) via `uploadDisputeEvidenceFile`; the result's `cid` is the storage
 * path, and signed URLs are minted at render time. Each upload races a timeout
 * (120s cold, 30s after `warmUpIpns()`) and surfaces an
 * `IpfsUploadTimeoutError` the callers map via `errorMessage`.
 */
import { supabase, uploadDisputeEvidenceFile } from '@/lib/supabase'
import { keccak256, toBytes } from 'viem'

const UPLOAD_TIMEOUT_MS_FIRST = 120_000
const UPLOAD_TIMEOUT_MS_WARM = 30_000

let isWarm = false
let warmPromise: Promise<void> | null = null

/** Pre-warm the Supabase session (best-effort; callers should `void` it). */
export function warmUpIpns(): Promise<void> {
  if (isWarm) return Promise.resolve()
  if (warmPromise) return warmPromise
  warmPromise = (async () => {
    try {
      const { error } = await supabase.auth.getSession()
      if (error) console.warn('[warmUpIpns] session check failed:', error)
    } catch (err) {
      console.warn('[warmUpIpns] session check threw:', err)
    } finally {
      // Even on failure stay warm so uploads use the shorter budget.
      isWarm = true
    }
  })()
  return warmPromise
}

interface IpfsUploadResult {
  /** Storage path, stored in `dispute_evidence.ipfs_cid` (name kept for back-compat). */
  cid: string
  size: number
  name: string
  /** keccak256(fileBytes) for `dispute_evidence.keccak_bytes32`. */
  keccakBytes32: `0x${string}`
}

class IpfsUploadTimeoutError extends Error {
  override name = 'IpfsUploadTimeoutError'
  readonly timeoutMs: number
  constructor(timeoutMs: number) {
    super(`Upload timed out after ${timeoutMs}ms — check your connection and try again.`)
    this.timeoutMs = timeoutMs
  }
}

/**
 * Race `work` against a timeout. The Supabase Storage SDK can't take an
 * AbortSignal, so the timeout only rejects the caller's promise.
 */
async function withAbortTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let reject!: (err: IpfsUploadTimeoutError) => void
  const timeoutPromise = new Promise<T>((_, rej) => {
    reject = rej
  })
  const timer = setTimeout(() => reject(new IpfsUploadTimeoutError(timeoutMs)), timeoutMs)
  try {
    return await Promise.race([work, timeoutPromise])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Upload a File to dispute evidence storage.
 * `disputeId` is mandatory — the Storage RLS predicate keys on the leading
 * UUID in the object name.
 */
export async function uploadToIpfs(
  file: File | Blob,
  disputeId: string,
  name = (file as File).name ?? 'file',
): Promise<IpfsUploadResult> {
  if (!disputeId) {
    throw new Error('uploadToIpfs: disputeId is required for evidence uploads')
  }
  const f = file instanceof File ? file : new File([file], name, { type: file.type })
  const timeoutMs = isWarm ? UPLOAD_TIMEOUT_MS_WARM : UPLOAD_TIMEOUT_MS_FIRST

  let result: Awaited<ReturnType<typeof uploadDisputeEvidenceFile>>
  try {
    result = await withAbortTimeout(uploadDisputeEvidenceFile(disputeId, f), timeoutMs)
  } catch (err) {
    if (err instanceof IpfsUploadTimeoutError) {
      console.warn('[uploadToIpfs] timed out:', err.message)
    } else {
      console.error('[uploadToIpfs] upload failed:', err)
    }
    throw err
  }

  return { cid: result.path, size: result.size, name: result.name, keccakBytes32: result.keccakBytes32 }
}

/**
 * Convert an evidence storage path to the bytes32 `submitEvidence(bytes32)`
 * accepts: keccak256("ipfs://" + cid), matching the contract tests.
 * NOT the same as `dispute_evidence.keccak_bytes32` (the file-content hash).
 */
export function cidToBytes32(cid: string): `0x${string}` {
  // Reject empty / oversized / control-character / non-printable inputs before
  // hashing — a meaningless URI would silently corrupt the audit trail.
  if (typeof cid !== 'string') {
    throw new TypeError('cidToBytes32: cid must be a string')
  }
  const trimmed = cid.trim()
  if (trimmed.length === 0) {
    throw new Error('cidToBytes32: cid must be a non-empty string')
  }
  if (trimmed.length > 256) {
    throw new Error(`cidToBytes32: cid is too long (${trimmed.length} chars, max 256)`)
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    throw new Error('cidToBytes32: cid contains control characters')
  }
  if (!/^[A-Za-z0-9._/:+-]+$/.test(trimmed)) {
    throw new Error(`cidToBytes32: cid contains disallowed characters (got "${trimmed}")`)
  }
  return keccak256(toBytes(`ipfs://${trimmed}`))
}
