import { useTranslation } from 'react-i18next'
import type { ConversationView } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { shortTradeId } from '@/lib/utils'
import { useEscrowState } from '@/hooks/useDisputes'
import { deriveEscrowStatus } from '@/hooks/useTrades'

/**
 * Compact pill shown in the chat header — the linked trade id + its live
 * status. The status is derived from the escrow contract (same mapping as the
 * /trades list) so it shows the real phase (grace period, funded, …) instead of
 * a lagging DB mirror value.
 */
export function TradeSummaryPill({ trade }: { trade: NonNullable<ConversationView['trade']> }) {
  const { t } = useTranslation()

  const escrowAddr = (trade.escrow_contract_addr ?? undefined) as `0x${string}` | undefined
  const { data: escrowState } = useEscrowState(escrowAddr)

  const status = escrowState
    ? deriveEscrowStatus(
        escrowState.state,
        escrowState.buyerSecurityDeposited,
        escrowState.sellerSecurityDeposited,
        escrowState.fundsLocked,
      )
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
