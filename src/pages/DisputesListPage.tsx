import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ShieldAlert, Loader2, Inbox, Plus, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { FullDropdown } from '@/components/custom/FullDropdown'
import { useDisputes } from '@/hooks/useDisputes'

/**
 * Status enum values mirror `DisputeStatus` in `src/types/database.ts`. Defined
 * inline (instead of importing the enum) so the page typechecks under the
 * project's `erasableSyntaxOnly` + `verbatimModuleSyntax` flags.
 */
type DisputeStatusValue =
  | 'open'
  | 'in_review'
  | 'escalated'
  | 'resolved'
  | 'closed'
type StatusFilter = DisputeStatusValue | 'all'

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In Review' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

const STATUS_STYLES: Record<DisputeStatusValue, string> = {
  open: 'bg-primary text-primary-foreground',
  in_review: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  escalated: 'bg-orange-500/15 text-orange-600 dark:text-orange-300',
  resolved: 'bg-green-500/15 text-green-600 dark:text-green-300',
  closed: 'bg-muted text-muted-foreground',
}

const STATUS_LABEL: Record<DisputeStatusValue, string> = {
  open: 'Open',
  in_review: 'In Review',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Try to extract a tx hash from the dispute description blob. The create page
 * embeds `tx_hash: 0x...` so the list can deep-link to Etherscan without
 * needing the on-chain columns in the DB.
 */
function extractTxHash(description: string | null | undefined): string | null {
  if (!description) return null
  const m = description.match(/tx_hash:\s*(0x[a-fA-F0-9]{64})/)
  return m ? m[1] : null
}

export function DisputesListPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const { data: disputes, isLoading, isError } = useDisputes()

  const filtered = useMemo(() => {
    if (!disputes) return []
    if (statusFilter === 'all') return disputes
    return disputes.filter((d) => d.status === statusFilter)
  }, [disputes, statusFilter])

  return (
    <section className="space-y-8">
      <AppPageHeader
        title="Disputes"
        subtitle="Track and manage your open and past disputes"
        variant="split"
        action={
          <Button asChild className="rounded-full shadow-none">
            <Link to="/app/dispute">
              <Plus className="w-4 h-4 mr-1" />
              New Dispute
            </Link>
          </Button>
        }
      />

      {/* Filter strip */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <Text variant="muted">
          {filtered.length} {filtered.length === 1 ? 'dispute' : 'disputes'}
        </Text>
        <FullDropdown
          label="Status"
          value={statusFilter}
          onSelect={(v) => setStatusFilter(v as StatusFilter)}
          options={FILTERS}
        />
      </div>

      {/* Body */}
      {isLoading ? (
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading disputes…
          </div>
        </Card>
      ) : isError ? (
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <ShieldAlert className="w-8 h-8 text-destructive" />
            <Text variant="h4">Couldn’t load disputes</Text>
            <Text variant="muted">
              Something went wrong while fetching your disputes. Try again later.
            </Text>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <Inbox className="w-10 h-10 text-muted-foreground" />
            <div className="space-y-1">
              <Text variant="h4">No disputes yet</Text>
              <Text variant="muted" className="max-w-sm">
                {statusFilter === 'all'
                  ? 'When you open a dispute on a trade, it will appear here.'
                  : `No disputes with status "${STATUS_LABEL[statusFilter as DisputeStatusValue] ?? statusFilter}".`}
              </Text>
            </div>
            {statusFilter === 'all' && (
              <Button asChild className="rounded-full shadow-none mt-2">
                <Link to="/app/dispute">
                  <ShieldAlert className="w-4 h-4 mr-1" />
                  Open your first dispute
                </Link>
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((d) => {
            const status = d.status as DisputeStatusValue
            const txHash = extractTxHash(d.description)
            const trade = d.trade as
              | { trade_id: string; crypto_token?: string; crypto_amount?: number }
              | null
            return (
              <li key={d.id}>
                <Link
                  to={`/app/disputes/${d.id}`}
                  className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
                >
                  <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl transition-colors group-hover:border-primary/50 group-hover:bg-background/70">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Text
                            variant="small"
                            className="uppercase tracking-wider text-muted-foreground"
                          >
                            {d.dispute_id}
                          </Text>
                          <span
                            className={`inline-flex items-center px-2 h-5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}
                          >
                            {STATUS_LABEL[status]}
                          </span>
                        </div>

                        <Text variant="h4" className="truncate">
                          {d.reason}
                        </Text>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                          <div className="flex flex-col">
                            <span className="text-muted-foreground text-xs">Trade</span>
                            <span className="font-mono truncate">
                              {trade?.trade_id ?? d.trade_id}
                            </span>
                          </div>
                          {trade?.crypto_token && (
                            <div className="flex flex-col">
                              <span className="text-muted-foreground text-xs">Amount</span>
                              <span className="font-mono">
                                {trade.crypto_amount} {trade.crypto_token}
                              </span>
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="text-muted-foreground text-xs">Filed</span>
                            <span>{formatDate(d.created_at)}</span>
                          </div>
                        </div>

                        {txHash && (
                          <p className="text-xs text-muted-foreground font-mono pt-1 inline-flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            tx {txHash.slice(0, 10)}…{txHash.slice(-6)}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <noscript>
        <Text variant="muted">
          Connect your wallet to load your disputes.
        </Text>
        <div className="mt-2">
          <ConnectButton showBalance={false} />
        </div>
      </noscript>
    </section>
  )
}
