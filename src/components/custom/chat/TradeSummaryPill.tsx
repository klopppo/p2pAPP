import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isAddress } from 'viem'
import type { ConversationView } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { shortTradeId } from '@/lib/utils'
import { useEscrowState } from '@/hooks/useDisputes'
import { deriveEscrowStatus } from '@/hooks/useTrades'
import { getCachedEscrowStatus, setCachedEscrowStatus } from '@/lib/escrowStatusCache'

/**
 * Chat-header pill: trade id + live escrow-contract status (falls back to the
 * DB mirror only when there's no escrow address).
 */
export function TradeSummaryPill({ trade }: { trade: NonNullable<ConversationView['trade']> }) {
  const { t } = useTranslation()

  // Validate before the cast: a malformed DB value would otherwise trigger
  // pointless RPC polling against an invalid address.
  const rawEscrowAddr = trade.escrow_contract_addr
  const escrowAddr =
    rawEscrowAddr && isAddress(rawEscrowAddr) ? rawEscrowAddr : undefined
  const { data: escrowState } = useEscrowState(escrowAddr)

  const liveStatus = escrowState
    ? deriveEscrowStatus(
        escrowState.state,
        escrowState.buyerSecurityDeposited,
        escrowState.sellerSecurityDeposited,
        escrowState.fundsLocked,
        escrowState.securityDepositPct,
      )
    : null

  // Persist the last-known phase so the next load shows it instantly.
  useEffect(() => {
    if (escrowAddr && liveStatus) setCachedEscrowStatus(escrowAddr, liveStatus)
  }, [escrowAddr, liveStatus])

  // Live → last-known localStorage value → DB mirror (avoided when we have an
  // escrow address, since the mirror can be stale).
  const status = escrowAddr
    ? (liveStatus ?? getCachedEscrowStatus(escrowAddr) ?? trade.escrow_status)
    : trade.escrow_status

  const ESCROW_LABELS: Record<
    string,
    { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
  > = {
    awaiting_deposit: { label: t('trades.escrowAwaitingDeposit'), variant: 'outline' },
    buyer_deposited: { label: t('trades.escrowBuyerDeposited'), variant: 'secondary' },
    seller_deposited: { label: t('trades.escrowSellerDeposited'), variant: 'secondary' },
    funded: { label: t('trades.escrowFunded'), variant: 'secondary' },
    confirmed: { label: t('trades.escrowGracePeriod'), variant: 'default' },
    deposited: { label: t('trades.escrowDeposited'), variant: 'secondary' },
    pending_release: { label: t('trades.escrowPendingRelease'), variant: 'default' },
    disputed: { label: t('trades.escrowDisputed'), variant: 'destructive' },
    released: { label: t('trades.escrowReleased'), variant: 'secondary' },
    refunded: { label: t('trades.escrowRefunded'), variant: 'outline' },
    cancelled: { label: t('trades.escrowCancelled'), variant: 'outline' },
  }

  const meta = ESCROW_LABELS[status] ?? {
    label: status,
    variant: 'outline' as const,
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-background/50 border border-border/50 px-3 py-1.5">
      <span className="text-xs font-mono text-muted-foreground">{shortTradeId(trade.trade_id)}</span>
      <Badge variant={meta.variant} className="rounded-full text-[10px] py-0">
        {meta.label}
      </Badge>
    </div>
  )
}
