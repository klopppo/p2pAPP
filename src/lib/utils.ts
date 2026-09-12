import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Truncate an Ethereum address to `0x1234…abcd` format. */
export function shortAddress(addr: string): string {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/**
 * Truncate a trade (or other) identifier to `ABC...xyz` — first 3 chars, three
 * dots, last 3 chars (e.g. `TRD-MTTVDYSH2QL4AMRTUK` → `TRD...TUK`). Full
 * identifiers must never be rendered in the UI.
 */
export function shortTradeId(id: string | null | undefined): string {
  if (!id) return '—'
  const s = String(id)
  if (s.length <= 6) return s
  return `${s.slice(0, 3)}...${s.slice(-3)}`
}

/**
 * Human label for an escrow grace period given in seconds: hours under a day,
 * otherwise days (e.g. 3600 → "1h", 604800 → "7d").
 */
export function formatGracePeriod(seconds: number | bigint): string {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0) return '—'
  if (s < 24 * 60 * 60) return `${Math.max(1, Math.round(s / 3600))}h`
  return `${Math.round(s / (24 * 60 * 60))}d`
}

/**
 * Countdown label for a remaining duration (seconds):
 *   ≥ 1 day  → "2d 3h"
 *   ≥ 1 hour → "5h"
 *   < 1 hour → "42m"
 */
export function formatDuration(seconds: number | bigint): string {
  const s = Math.max(0, Math.floor(Number(seconds)))
  const days = Math.floor(s / 86_400)
  const hours = Math.floor((s % 86_400) / 3_600)
  const minutes = Math.floor((s % 3_600) / 60)
  if (days >= 1) return `${days}d ${hours}h`
  if (hours >= 1) return `${hours}h`
  return `${minutes}m`
}

/** International ISO 4217 Currency Symbols map */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  BRL: 'R$',
  TRY: '₺',
  ARS: '$',
  NGN: '₦',
  INR: '₹',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  MXN: 'Mex$',
  COP: 'COL$',
  CHF: 'CHF ',
  PHP: '₱',
  VND: '₫',
  AED: 'AED ',
  CNY: '¥',
}

export function currencySymbol(code?: string | null): string {
  if (!code) return ''
  return CURRENCY_SYMBOLS[code] ?? `${code} `
}

