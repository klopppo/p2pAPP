/**
 * Localized, user-facing message for a thrown wallet/write error. Pages that
 * need full control should call `extractWriteError()` and pick their own key.
 */
import { extractWriteError } from './errors'

export function errorMessage(
  err: unknown,
  page: string,
  t: (key: string, opts?: Record<string, string>) => string,
  fallbackKey: string = 'errorGeneric',
): string {
  const extracted = extractWriteError(err)
  // IPFS upload timeout has its own page-specific copy (audit M5).
  if (
    extracted.kind === 'network' &&
    extracted.original instanceof Error &&
    extracted.original.name === 'IpfsUploadTimeoutError'
  ) {
    return t(`${page}.errorUploadTimeout`)
  }
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
