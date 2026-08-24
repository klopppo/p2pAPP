/**
 * Friendly wallet / write error messages. Catch blocks should use these
 * helpers instead of `(err as Error).message` so users see a friendly toast
 * on MetaMask rejections / contract reverts / RPC failures.
 */
import { extractWriteError } from './errors'

export { extractWriteError } from './errors'

/**
 * Convert a thrown wallet/write error into a localized message.
 *
 * - 'cancelled' (user closed the wallet popup) → `errors.cancelledByUser`
 * - 'network' (RPC failure / wrong chain)      → `errors.networkError`
 * - 'reverted' (contract revert)               → `errors.reverted` with
 *   `{{reason}}` containing the clean shortMessage (e.g. `InvalidKlerosSubcourt()`).
 * - 'unknown'                                  → `${page}.${fallbackKey}`
 *   (defaults to `${page}.errorGeneric`). The existing per-action
 *   `confirmFailed` / `releaseFailed` / etc. keys can be passed as
 *   `fallbackKey` so the message reads "Failed to confirm: ..." instead
 *   of a generic "Something went wrong".
 *
 *   toast.error(errorMessage(err, 'tradeDetail', t, 'confirmFailed'))
 *
 * Pages that want full control should call `extractWriteError()` directly
 * and pick their own i18n key by `kind`.
 */
export function errorMessage(
  err: unknown,
  page: string,
  t: (key: string, opts?: Record<string, string>) => string,
  fallbackKey: string = 'errorGeneric',
): string {
  const extracted = extractWriteError(err)
  switch (extracted.kind) {
    case 'cancelled':
      return t('errors.cancelledByUser')
    case 'network':
      return t('errors.networkError')
    case 'reverted':
      return t('errors.reverted', { reason: extracted.message.replace(/^Reverted: /, '') })
    case 'unknown':
    default:
      return t(`${page}.${fallbackKey}`, { message: extracted.message })
  }
}

/**
 * Field-name only — extract the raw reason (cleaned) for display in
 * detail sections / inline error chips where a localized wrapper would
 * hide the contract-level detail. Pair with `extractWriteError().kind` if
 * you also need to know "was it a user reject".
 */
export function errorReason(err: unknown): string | null {
  const extracted = extractWriteError(err)
  if (extracted.kind === 'reverted') {
    return extracted.message.replace(/^Reverted: /, '')
  }
  if (extracted.kind === 'cancelled' || extracted.kind === 'network') {
    return null
  }
  return extracted.message
}
