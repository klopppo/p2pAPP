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
