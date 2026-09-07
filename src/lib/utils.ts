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

