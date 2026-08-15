import type { ConversationView } from '@/types/database'
import { Badge } from '@/components/ui/badge'

const ESCROW_LABELS: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  awaiting_deposit: { label: 'Awaiting deposit', variant: 'outline' },
  buyer_deposited: { label: 'Buyer deposited', variant: 'secondary' },
  seller_deposited: { label: 'Seller locked', variant: 'secondary' },
  confirmed: { label: 'Confirmed', variant: 'default' },
  deposited: { label: 'Deposited', variant: 'secondary' },
  pending_release: { label: 'Pending release', variant: 'default' },
  disputed: { label: 'Disputed', variant: 'destructive' },
  released: { label: 'Released', variant: 'secondary' },
  refunded: { label: 'Refunded', variant: 'outline' },
}

/**
 * Compact pill shown in the chat header — quick view of the linked trade's
 * status and amount without leaving the conversation.
 */
export function TradeSummaryPill({ trade }: { trade: NonNullable<ConversationView['trade']> }) {
  const meta = ESCROW_LABELS[trade.escrow_status] ?? {
    label: trade.escrow_status,
    variant: 'outline' as const,
  }
  return (
    <div className="flex items-center gap-2 rounded-full bg-background/50 border border-border/50 px-3 py-1.5">
      <span className="text-xs font-mono text-muted-foreground">{trade.trade_id}</span>
      <Badge variant={meta.variant} className="rounded-full text-[10px] py-0">
        {meta.label}
      </Badge>
      <span className="text-xs font-mono">
        {Number(trade.crypto_amount).toLocaleString('en-US', { maximumFractionDigits: 4 })}{' '}
        {trade.crypto_token}
      </span>
    </div>
  )
}
