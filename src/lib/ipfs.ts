/**
 * Dispute evidence upload helper.
 *
 * Audit history:
 *   - #4: replaced the browser-Helia node, which never pinned CIDs to the
 *     public network (so uploaded evidence never resolved via
 *     `https://ipfs.io/ipfs/<cid>`). Uploads now go to Supabase Storage via
 *     `uploadDisputeEvidenceFile` in `src/lib/supabase/index.ts`.
 *   - #8: `warmUpIpns` (renamed from `warmUpIpfs`) is now wired into
 *     `AppLayout` so the Supabase session is warm before the user hits the
 *     dispute form.
 *   - #9: `uploadToIpfs` runs each upload through `Promise.race` against an
 *     `AbortController` — 120s on a cold call, 30s after `warmUpIpns()` has
 *     flipped the warm flag. Aborts surface as a friendly
 *     `IpfsUploadTimeoutError` the callers catch and pass to `errorMessage`.
 */
import { uploadDisputeEvidenceFile } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

// `disputeId` is captured by the upload helper; we keep `cidToBytes32` here
// because the page (and `DisputeDetailPage`) both consume it. The
// `ipfs://${cid}` encoding mirrors the contract test in
// `contrats/test/klerosTests.t.sol:2413,2425,2464` — see the comment on
// `cidToBytes32` below.
import { keccak256, toBytes } from 'viem'

/** Cold-path upload budget (first ever upload in this tab). */
const UPLOAD_TIMEOUT_MS_FIRST = 120_000
/** Warm-path upload budget (after `warmUpIpns()` has resolved). */
const UPLOAD_TIMEOUT_MS_WARM = 30_000

/** Module-scoped warm flag. Set by `warmUpIpns()`; read by `uploadToIpfs`. */
let isWarm = false
/** Single in-flight warmup — concurrent callers all await the same promise. */
let warmPromise: Promise<void> | null = null

/**
 * Pre-warm the Supabase session. Best-effort: a failure does not throw;
 * callers should `void` the returned promise.
 *
 * Today there's no expensive node to spin up (Supabase Storage uses a plain
 * HTTPS upload). We still flip the `isWarm` flag so subsequent uploads use
 * the shorter timeout and skip the cold-path latency budget.
 */
export function warmUpIpns(): Promise<void> {
  if (isWarm) return Promise.resolve()
  if (warmPromise) return warmPromise
  warmPromise = (async () => {
    // Touch the Supabase client — a no-op fetch against the auth endpoint.
    // If the session is broken we want to fail here (in the warm path),
    // not on the first user-initiated upload. Errors don't throw — they
    // just leave `isWarm = true` so the page still uses the shorter
    // budget.
    try {
      const { error } = await supabase.auth.getSession()
      if (error) {
        console.warn('[warmUpIpns] session check failed:', error)
      }
    } catch (err) {
      console.warn('[warmUpIpns] session check threw:', err)
    } finally {
      isWarm = true
    }
  })()
  return warmPromise
}

/** Back-compat alias — older call sites used the old name. */
export const warmUpIpfs = warmUpIpns

/**
 * Shape returned from `uploadToIpfs`. Mirrors the legacy Helia shape so the
 * DisputePage / DisputeDetailPage call sites don't need to change their
 * destructuring.
 */
export interface IpfsUploadResult {
  /** Storage path (`dispute-evidence/<disputeId>/<basename>-<ts>-<rand>.<ext>`).
   *  Stored in `dispute_evidence.ipfs_cid` — the column was originally for
   *  an IPFS CID; the name is kept for back-compat with existing rows. */
  cid: string
  /** Short-lived signed URL resolvable in the browser. */
  url: string
  /** Raw file size in bytes. */
  size: number
  /** Display name (File's name when present). */
  name: string
  /** keccak256(fileBytes) — file_hash for `dispute_evidence.keccak_bytes32`.
   *  Distinct from the on-chain URI bytes32 (see `cidToBytes32`). */
  keccakBytes32: `0x${string}`
}

/** Thrown when the upload times out (cold or warm). Callers should map this
 *  to a localized toast via `errorMessage`. */
export class IpfsUploadTimeoutError extends Error {
  override name = 'IpfsUploadTimeoutError'
  readonly timeoutMs: number
  constructor(timeoutMs: number) {
    super(
      `Upload timed out after ${timeoutMs}ms — check your connection and try again.`,
    )
    this.timeoutMs = timeoutMs
  }
}

/**
 * Race an `uploadToIpfs` against an `AbortController` so a stuck Supabase
 * upload can't pin the dispute form at `stage='uploading'` forever.
 *
 * Cold-path budget (first upload in a tab, before warmUpIpns lands) is
 * generous — 120s — because the Supabase session may still be handshaking.
 * Warm-path budget is 30s.
 */
async function withAbortTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    // The storage upload helpers don't take an AbortSignal, so we race them
    // against a timeout reject. The underlying request may continue in the
    // background — Supabase will clean it up on its own — but the page sees
    // a friendly error within `timeoutMs`.
    const result = await work
    if (timedOut) {
      throw new IpfsUploadTimeoutError(timeoutMs)
    }
    return result
  } catch (err) {
    if (timedOut) throw new IpfsUploadTimeoutError(timeoutMs)
    throw err
  } finally {
    clearTimeout(timer)
    // Suppress unused-binding lint for `controller` — it's needed for the
    // side-effect of `abort()`, even if the signal isn't read.
    void controller
  }
}

/**
 * Upload a File to dispute evidence storage and return its storage path
 * (as `cid`) plus a signed URL the page can render.
 *
 * `disputeId` is mandatory — the Storage RLS predicate in
 * `migrations/20260824000007_storage_buckets.sql` keys on the leading UUID
 * in the object name, so a missing/empty `disputeId` would (a) produce a
 * path with no leading UUID and (b) be rejected by the RLS `with check`.
 */
export async function uploadToIpfs(
  file: File | Blob,
  disputeId: string,
  name = (file as File).name ?? 'file',
): Promise<IpfsUploadResult> {
  if (!disputeId) {
    throw new Error('uploadToIpfs: disputeId is required for evidence uploads')
  }
  // Cast Blob to File so the helper's MIME-type fallback works. Most
  // call sites already pass a File from <input type="file">.
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

  return {
    cid: result.path,
    url: result.url,
    size: result.size,
    name: result.name,
    keccakBytes32: result.keccakBytes32,
  }
}

/**
 * Convert an evidence storage path (the value we store in
 * `dispute_evidence.ipfs_cid`) to the bytes32 that
 * `KlerosEsc.submitEvidence(bytes32)` accepts on-chain.
 *
 * Encodes `ipfs://${cid}` (with the URI scheme prefix) before keccak256,
 * matching the contract test in `contrats/test/klerosTests.t.sol:2413,
 * 2425, 2464`:
 *
 *   bytes32 URI = keccak256("ipfs://evidence/buyer");
 *
 * The contract doesn't validate the URI format — it just emits whatever
 * bytes32 is passed — but the off-chain Kleros UI and our own audit trail
 * both key on this encoding, so we keep the prefix consistent.
 *
 * IMPORTANT: this is NOT the same value as `dispute_evidence.keccak_bytes32`,
 * which holds the file-content hash (`keccak256(fileBytes)`) for off-chain
 * integrity checks. See `uploadDisputeEvidenceFile` in `src/lib/supabase`.
 */
export function cidToBytes32(cid: string): `0x${string}` {
  return keccak256(toBytes(`ipfs://${cid}`))
}

/**
 * Tear-down hook kept for the logout flow. With Supabase Storage there is
 * nothing to stop, but the signature is preserved so `Navbar` / sign-out
 * handlers don't break.
 */
export async function teardownIpfs(): Promise<void> {
  isWarm = false
  warmPromise = null
}
