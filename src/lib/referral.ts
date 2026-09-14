/**
 * Referral program ("Invite & Earn") shared logic.
 *
 * Mirrors the SQL mirrors in
 * supabase/migrations/20260915000005_referral_program.sql
 * (`calculate_fee_split`, code format, share constant). Keep this file and the
 * migration in sync — the client uses these for the dashboard preview, the DB
 * uses the SQL twin for the actual credit.
 */

/** Referrer share of the platform fee (basis points). Mirrors the SQL default. */
export const REFERRER_SHARE_BPS = 1500 // 15%

/** Trade fees are quoted in basis points per the `platform_fee_bps` column. */
export const FEE_BASIS = 10_000

/** Referral codes are 8 uppercase hex chars, e.g. `3F2A9C1B`. */
export const REFERRAL_CODE_RE = /^[A-Fa-f0-9]{8}$/

export function isValidReferralCode(code: string): boolean {
  return REFERRAL_CODE_RE.test(code.trim())
}

/**
 * Platform fee on a trade, in the trade's fiat currency.
 * `fiatAmount * fee_bps / 10000`, rounded to 2dp (fiat precision).
 */
export function computePlatformFee(
  fiatAmount: number,
  feeBps: number,
): number {
  const fee = (fiatAmount * feeBps) / FEE_BASIS
  return Math.round(fee * 100) / 100
}

/**
 * Referrer earnings for a completed referred trade. Rounded to 2dp from the
 * already-rounded platform fee so the preview always matches the SQL credit.
 */
export function computeReferralEarnings(
  fiatAmount: number,
  feeBps: number,
  shareBps: number = REFERRER_SHARE_BPS,
): number {
  const fee = computePlatformFee(fiatAmount, feeBps)
  return Math.round(fee * (shareBps / FEE_BASIS) * 100) / 100
}

/**
 * Share percentage as a human label, e.g. `15%`.
 */
export function sharePercent(shareBps: number = REFERRER_SHARE_BPS): string {
  return `${shareBps / 100}%`
}

/**
 * The public invite URL for a referrer code. `origin` defaults to the current
 * window origin and can be overridden in tests / SSR.
 */
export function buildReferralUrl(
  code: string,
  origin: string =
    typeof window !== 'undefined' ? window.location.origin : 'https://coffernode.io',
): string {
  return `${origin}/r/${code.toUpperCase()}`
}

/** localStorage key holding a not-yet-claimed referral code. */
export const PENDING_REFERRAL_KEY = 'coffernode:referral:pending'

/**
 * Stash an attributed code so the first authenticated session of the new
 * wallet can claim it (first-touch attribution without PII/email collection).
 */
export function savePendingReferral(code: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PENDING_REFERRAL_KEY, code.trim().toUpperCase())
  } catch {
    /* storage unavailable — attribution is best-effort */
  }
}

/**
 * Read + remove the pending referral code in one call. Returns null when there
 * is nothing to claim (idempotent — repeated calls yield null).
 */
export function consumePendingReferral(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const code = window.localStorage.getItem(PENDING_REFERRAL_KEY)
    if (!code) return null
    window.localStorage.removeItem(PENDING_REFERRAL_KEY)
    return code.toUpperCase()
  } catch {
    return null
  }
}