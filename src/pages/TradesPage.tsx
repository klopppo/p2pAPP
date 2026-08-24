import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, Inbox, ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { FullDropdown } from '@/components/custom/FullDropdown'
import { useTrades } from '@/hooks/useTrades'
import { useCurrentUser } from '@/hooks/useCurrentUser'

type RoleFilter = 'all' | 'buyer' | 'seller'
type StatusFilter =
  | 'all'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | 'refunded'
  | 'pending'

function formatAddress(addr: string | null | undefined) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface TradeRow {
  id: string
  trade_id: string
  status: string
  escrow_status: string
  crypto_token: string
  crypto_amount: number | string
  fiat_currency: string
  fiat_amount: number | string
  created_at: string
  buyer_id: string
  seller_id: string
  buyer?: {
    wallet_address?: string
    nickname?: string | null
    avatar_url?: string | null
  } | null
  seller?: {
    wallet_address?: string
    nickname?: string | null
    avatar_url?: string | null
  } | null
}

export function TradesPage() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const { data: trades = [], isLoading, isError } = useTrades()
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
    { value: 'all', label: t('trades.roleAll') },
    { value: 'buyer', label: t('trades.roleAsBuyer') },
    { value: 'seller', label: t('trades.roleAsSeller') },
  ]

  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('trades.statusAll') },
    { value: 'pending', label: t('trades.statusPending') },
    { value: 'active', label: t('trades.statusActive') },
    { value: 'completed', label: t('trades.statusCompleted') },
    { value: 'cancelled', label: t('trades.statusCancelled') },
    { value: 'disputed', label: t('trades.statusDisputed') },
    { value: 'refunded', label: t('trades.statusRefunded') },
  ]

  const ESCROW_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    awaiting_deposit: { label: t('trades.escrowAwaitingDeposit'), variant: 'outline' },
    buyer_deposited: { label: t('trades.escrowBuyerDeposited'), variant: 'secondary' },
    seller_deposited: { label: t('trades.escrowSellerDeposited'), variant: 'secondary' },
    funded: { label: t('trades.escrowFunded') ?? 'Funded', variant: 'secondary' },
    confirmed: { label: t('trades.escrowConfirmed'), variant: 'default' },
    deposited: { label: t('trades.escrowDeposited'), variant: 'secondary' },
    pending_release: { label: t('trades.escrowPendingRelease'), variant: 'default' },
    disputed: { label: t('trades.escrowDisputed'), variant: 'destructive' },
    released: { label: t('trades.escrowReleased'), variant: 'secondary' },
    refunded: { label: t('trades.escrowRefunded'), variant: 'outline' },
    cancelled: { label: t('trades.escrowCancelled') ?? 'Cancelled', variant: 'outline' },
  }

  const myId = user?.id

  const filtered = useMemo(() => {
    return (trades as TradeRow[]).filter((t) => {
      if (!myId) return true
      const matchesRole =
        roleFilter === 'all' ||
        (roleFilter === 'buyer' && t.buyer_id === myId) ||
        (roleFilter === 'seller' && t.seller_id === myId)
      const matchesStatus =
        statusFilter === 'all' || t.status === statusFilter
      return matchesRole && matchesStatus
    })
  }, [trades, myId, roleFilter, statusFilter])

  return (
    <section className="space-y-8">
      <AppPageHeader
        title={t('trades.title')}
        subtitle={t('trades.subtitle')}
        variant="split"
        action={
          <Button asChild className="rounded-full shadow-none">
            <Link to="/app/offers">
              <ArrowLeftRight className="w-4 h-4 mr-1" />
              {t('trades.browseOffers')}
            </Link>
          </Button>
        }
      />

      {/* Filter strip */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <Text variant="muted">
          {t('trades.tradeCount', { count: filtered.length })}
        </Text>
        <div className="flex items-center gap-3">
          <FullDropdown
            label={t('trades.roleLabel')}
            value={roleFilter}
            onSelect={(v) => setRoleFilter(v as RoleFilter)}
            options={ROLE_FILTERS}
          />
          <FullDropdown
            label={t('trades.statusLabel')}
            value={statusFilter}
            onSelect={(v) => setStatusFilter(v as StatusFilter)}
            options={STATUS_FILTERS}
          />
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('trades.loadingTrades')}
          </div>
        </Card>
      ) : isError ? (
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <Text variant="h4">{t('trades.errorTitle')}</Text>
            <Text variant="muted">
              {t('trades.errorDescription')}
            </Text>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <Inbox className="w-10 h-10 text-muted-foreground" />
            <div className="space-y-1">
              <Text variant="h4">{t('trades.emptyTitle')}</Text>
              <Text variant="muted" className="max-w-sm">
                {t('trades.emptyDescription')}
              </Text>
            </div>
            <Button asChild className="rounded-full shadow-none mt-2">
              <Link to="/app/offers">
                <ArrowLeftRight className="w-4 h-4 mr-1" />
                {t('trades.findAnOffer')}
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((trade) => {
            const escrowMeta = ESCROW_LABELS[trade.escrow_status] ?? {
              label: trade.escrow_status,
              variant: 'outline' as const,
            }
            const counterparty =
              myId === trade.buyer_id ? trade.seller : trade.buyer
            const role = myId === trade.buyer_id ? 'buyer' : 'seller'
            const cpName =
              counterparty?.nickname ??
              formatAddress(counterparty?.wallet_address)
            const cpAvatar = counterparty?.avatar_url ?? undefined
            return (
              <li key={trade.id}>
                <Link
                  to={`/app/trades/${trade.id}`}
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
                            {trade.trade_id}
                          </Text>
                          <Badge
                            variant={escrowMeta.variant}
                            className="rounded-full text-[10px] py-0"
                          >
                            {escrowMeta.label}
                          </Badge>
                        </div>

                        <Text variant="h4" className="truncate">
                          {Number(trade.crypto_amount).toLocaleString('en-US', {
                            maximumFractionDigits: 6,
                          })}{' '}
                          {trade.crypto_token}
                          <span className="text-muted-foreground font-normal">
                            {' '}
                            ·{' '}
                            {Number(trade.fiat_amount).toLocaleString('en-US', {
                              maximumFractionDigits: 2,
                            })}{' '}
                            {trade.fiat_currency}
                          </span>
                        </Text>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                          <div className="flex flex-col">
                            <span className="text-muted-foreground text-xs">
                              {role === 'buyer' ? t('trades.sellerLabel') : t('trades.buyerLabel')}
                            </span>
                            <span className="inline-flex items-center gap-1.5 truncate">
                              <Avatar className="h-5 w-5">
                                {cpAvatar && (
                                  <AvatarImage src={cpAvatar} alt="" />
                                )}
                                <AvatarFallback className="text-[9px]">
                                  {cpName.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate">{cpName}</span>
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-muted-foreground text-xs">
                              {t('trades.tradeStatus')}
                            </span>
                            <span className="capitalize">{trade.status}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-muted-foreground text-xs">
                              {t('trades.opened')}
                            </span>
                            <span>{formatDate(trade.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
