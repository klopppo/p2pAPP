import { shortAddress } from '@/lib/utils'

/** Truncated address (`0x1234…abcd`); em-dash when absent. */
export function formatAddress(addr: string | null | undefined): string {
  return addr ? shortAddress(addr) : '—'
}

/** Short local date (`Jan 5, 2026`); em-dash when absent or unparseable. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** viem receipts resolve for reverted txs; check status before success writes. */
export function assertTxSuccess(receipt: { status: 'success' | 'reverted' }) {
  if (receipt.status === 'reverted') {
    throw new Error('Transaction reverted on-chain')
  }
}
