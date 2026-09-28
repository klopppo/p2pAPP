/**
 * Referral program ("Invite & Earn") shared logic. Mirrors the SQL twins in
 * supabase/migrations/20260915000005_referral_program.sql — keep in sync.
 */

/** Referrer share of the platform fee (basis points); mirrors the SQL default. */
export const REFERRER_SHARE_BPS = 1500

const FEE_BASIS = 10_000
const REFERRAL_CODE_RE = /^[A-Fa-f0-9]{8}$/

export function isValidReferralCode(code: string): boolean {
  return REFERRAL_CODE_RE.test(code.trim())
}

/** Platform fee in fiat, rounded to 2dp. */
export function computePlatformFee(fiatAmount: number, feeBps: number): number {
  return Math.round(((fiatAmount * feeBps) / FEE_BASIS) * 100) / 100
}

/** Referrer earnings for a completed referred trade (rounded from the fee). */
export function computeReferralEarnings(
  fiatAmount: number,
  feeBps: number,
  shareBps: number = REFERRER_SHARE_BPS,
): number {
  return Math.round(computePlatformFee(fiatAmount, feeBps) * (shareBps / FEE_BASIS) * 100) / 100
}

/** Share percentage as a human label, e.g. `15%`. */
export function sharePercent(shareBps: number = REFERRER_SHARE_BPS): string {
  return `${shareBps / 100}%`
}

/** Public invite URL; `origin` is overridable for tests / SSR. */
export function buildReferralUrl(
  code: string,
  origin: string = typeof window !== 'undefined' ? window.location.origin : 'https://coffernode.io',
): string {
  return `${origin}/r/${code.toUpperCase()}`
}

export const PENDING_REFERRAL_KEY = 'coffernode:referral:pending'

/** Stash an attributed code for the first authenticated session to claim. */
export function savePendingReferral(code: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PENDING_REFERRAL_KEY, code.trim().toUpperCase())
  } catch {
    // storage unavailable — attribution is best-effort
  }
}

/** Read + remove the pending code (idempotent: repeated calls yield null). */
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
