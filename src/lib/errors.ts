/**
 * Friendly error extractor for viem / wagmi write failures.
 *
 * Background: every catch-block in the pages calls
 * `toast.error(t('...failed', { message: (err as Error).message }))`, which
 * surfaces the raw exception string. For a MetaMask "User rejected the
 * request" the user sees "...failed: User rejected the request.", and for a
 * contract revert they see "...failed: <huge decoded reason blob>".
 *
 * `extractWriteError(err)` returns a small, localized-friendly shape with:
 *   • `kind` — `'cancelled'` (user closed the wallet popup) / `'reverted'`
 *     (contract revert; reason extracted) / `'network'` (chain id mismatch,
 *     RPC failure) / `'unknown'` (anything else)
 *   • `message` — short human-readable English copy. Pass directly to a
 *     toast or pipe through the i18n layer.
 *   • `original` — the original error, for `console.error` logging.
 *
 * Use this everywhere a `writeContractAsync` (or its writeAsync cousins)
 * fails. The i18n helpers live next to each catch block so per-page copy
 * can be tuned without changing this helper.
 */
export type WriteErrorKind = 'cancelled' | 'reverted' | 'network' | 'unknown'

export interface ExtractedWriteError {
  kind: WriteErrorKind
  message: string
  original: unknown
}

/**
 * Read the short-name from the error, treating both viem v2
 * `BaseError.name` (`'UserRejectedRequestError'`, `'ContractFunctionRevertedError'`,
 * `'ChainMismatchError'`, etc.) and the v2-coded `code` short strings.
 */
export function extractWriteError(err: unknown): ExtractedWriteError {
  const original = err
  if (err == null) {
    return { kind: 'unknown', message: 'Unknown error', original }
  }

  const name = (err as { name?: string })?.name ?? ''
  const code = (err as { code?: number | string })?.code
  const shortMessage = (err as { shortMessage?: string })?.shortMessage
  const message = (err as { message?: string })?.message ?? ''

  // 1) User explicitly closed the MetaMask/WalletConnect popup.
  if (
    name === 'UserRejectedRequestError' ||
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    /user rejected|user denied|user cancelled/i.test(`${shortMessage} ${message}`)
  ) {
    return { kind: 'cancelled', message: 'Cancelled by user', original }
  }

  // 2) Chain mismatch — wagmi throws this when a connector is on the wrong
  //    chain and the call goes out anyway. Common cause of "reverted"
  //    with no useful message.
  if (
    name === 'ChainMismatchError' ||
    name === 'SwitchChainError' ||
    /chain mismatch|wrong network|unsupported chain/i.test(`${name} ${message}`)
  ) {
    return { kind: 'network', message: 'Wrong network — switch to the expected chain.', original }
  }

  // 3) Contract revert. viem gives us `shortMessage` (e.g.
  //    "execution reverted: InvalidKlerosSubcourt()") and `data`/`reason`.
  if (
    name === 'ContractFunctionRevertedError' ||
    name === 'ContractFunctionExecutionError' ||
    /execution reverted|reverted: |reverted with/i.test(`${shortMessage} ${message}`)
  ) {
    // Prefer the concise shortMessage (custom error name + args) over the
    // blob that viem builds for human display.
    const clean =
      shortMessage && shortMessage.length > 0
        ? shortMessage.replace(/^execution reverted: /i, '')
        : extractReason(message) || 'Transaction reverted'
    return {
      kind: 'reverted',
      message: `Reverted: ${clean}`,
      original,
    }
  }

  // 4) RPC / network failures. viem surfaces these as `'HttpRequestError'`
  //    or `'TimeoutError'`. The 4xx/5xx strings also count.
  if (
    name === 'HttpRequestError' ||
    name === 'TimeoutError' ||
    name === 'NetworkError' ||
    /network request failed|fetch failed|rpc|timeout|504|503|connection/i.test(`${name} ${message}`)
  ) {
    return { kind: 'network', message: 'Network error — please try again.', original }
  }

  // 5) Fallback. The caller decides whether to log `original` and how to
  // surface the text via i18n.
  return {
    kind: 'unknown',
    message: extractReason(message) || 'Transaction failed',
    original,
  }
}

/** Pull a clean "InvalidX(...)" / plain-text reason out of a viem/ethers
 *  message blob. Best-effort — returns null if nothing looks like a reason. */
function extractReason(raw: string): string | null {
  if (!raw) return null
  // viem prepends "execution reverted: " or "estimateGas failed: ".
  const reverted = raw.match(/execution reverted:?\s*(.+?)(?:"|\n|$)/i)
  if (reverted) return reverted[1].trim()
  // ethers' "[method] error: ..." style.
  const method = raw.match(/\]\s*error:\s*(.+?)(?:"|\n|$)/i)
  if (method) return method[1].trim()
  return null
}
