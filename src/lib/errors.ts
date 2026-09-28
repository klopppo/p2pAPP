/**
 * Friendly error extractor for viem / wagmi write failures: maps raw errors to
 * a `kind` ('cancelled' | 'reverted' | 'network' | 'unknown'), a short message
 * and the original error for logging.
 */
type WriteErrorKind = 'cancelled' | 'reverted' | 'network' | 'unknown'

interface ExtractedWriteError {
  kind: WriteErrorKind
  message: string
  original: unknown
}

export function extractWriteError(err: unknown): ExtractedWriteError {
  const original = err
  if (err == null) return { kind: 'unknown', message: 'Unknown error', original }

  const name = (err as { name?: string })?.name ?? ''
  const code = (err as { code?: number | string })?.code
  const shortMessage = (err as { shortMessage?: string })?.shortMessage
  const message = (err as { message?: string })?.message ?? ''

  if (
    name === 'UserRejectedRequestError' ||
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    /user rejected|user denied|user cancelled/i.test(`${shortMessage} ${message}`)
  ) {
    return { kind: 'cancelled', message: 'Cancelled by user', original }
  }

  // Chain mismatch (including MetaMask's UnrecognizedChainError) — the common
  // cause of a "reverted" with no useful message.
  if (
    name === 'ChainMismatchError' ||
    name === 'SwitchChainError' ||
    name === 'UnrecognizedChainError' ||
    /chain mismatch|wrong network|unsupported chain|unrecognized chain/i.test(`${name} ${message}`)
  ) {
    return { kind: 'network', message: 'Wrong network — switch to the expected chain.', original }
  }

  if (
    name === 'ContractFunctionRevertedError' ||
    name === 'ContractFunctionExecutionError' ||
    /execution reverted|reverted: |reverted with/i.test(`${shortMessage} ${message}`)
  ) {
    // Prefer the concise shortMessage (custom error name + args).
    const clean =
      shortMessage && shortMessage.length > 0
        ? shortMessage.replace(/^execution reverted: /i, '')
        : extractReason(message) || 'Transaction reverted'
    return { kind: 'reverted', message: `Reverted: ${clean}`, original }
  }

  if (
    name === 'HttpRequestError' ||
    name === 'TimeoutError' ||
    name === 'NetworkError' ||
    name === 'IpfsUploadTimeoutError' ||
    /network request failed|fetch failed|rpc|timeout|504|503|connection/i.test(`${name} ${message}`)
  ) {
    return {
      kind: 'network',
      message:
        name === 'IpfsUploadTimeoutError'
          ? 'Upload timed out — check your connection and try again.'
          : 'Network error — please try again.',
      original,
    }
  }

  return { kind: 'unknown', message: extractReason(message) || 'Transaction failed', original }
}

/** Best-effort "InvalidX(...)" / plain-text reason from a viem/ethers blob. */
function extractReason(raw: string): string | null {
  if (!raw) return null
  const reverted = raw.match(/execution reverted:?\s*(.+?)(?:"|\n|$)/i)
  if (reverted) return reverted[1].trim()
  const method = raw.match(/\]\s*error:\s*(.+?)(?:"|\n|$)/i)
  if (method) return method[1].trim()
  return null
}
