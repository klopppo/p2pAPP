import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Copy, ExternalLink, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { OffersTableWrapper } from '@/components/custom/OffersTableWrapper'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { Text } from '@/components/ui/text'
import { ArrowUpDown } from 'lucide-react'
import { useUserProfile, useOffersBySeller } from '@/hooks/useOffers'
import { useTranslation } from 'react-i18next'
import { ReviewList } from '@/components/custom/ReviewList'

// Local UI shape for the offers table. Mirrors what OffersTableWrapper expects;
// kept here because the data comes from useOffersBySeller (which returns the DB
// row) and needs to be reshaped before being passed down.
interface Offer {
  id: string
  trader: string
  trades: number
  type: 'buy' | 'sell'
  token: string
  amount: string
  price: number
  priceDisplay: string
  currency: string
  minAmount: number
  maxAmount: number
  isPositive: boolean
  seller: {
    name: string
    address: string
    avatar?: string
    rating: number
    totalTrades: number
    completionRate: string
    tags: string[]
  }
  paymentMethods: string[]
}

type SortKey = 'price' | 'minAmount' | 'maxAmount'
type SortDir = 'asc' | 'desc'

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
const currencySymbol = (code: string) => CURRENCY_SYMBOLS[code] ?? `${code} `

function formatNumber(n: number | string | null | undefined): string {
  const num = Number(n) || 0
  return num.toLocaleString()
}

function formatVolume(n: number | string | null | undefined): string {
  const num = Number(n) || 0
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`
  return `$${num.toLocaleString()}`
}

function formatAddress(addr: string): string {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ''
}

function SortableHeader({
  label,
  sortField,
  sortKey,
  onToggle,
}: {
  label: string
  sortField: SortKey
  sortKey: SortKey | null
  onToggle: (key: SortKey) => void
}) {
  return (
    <button
      onClick={() => onToggle(sortField)}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
    >
      {label}
      <ArrowUpDown className={`w-3.5 h-3.5 ${sortKey === sortField ? 'text-foreground' : 'text-muted-foreground/50'}`} />
    </button>
  )
}

export function ProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { walletAddress: urlWalletAddress } = useParams()
  const { address: connectedAddress, isConnected } = useAccount()

  // Target = URL param if present, else connected wallet
  const targetAddress = urlWalletAddress ?? connectedAddress
  const isOwnProfile = !urlWalletAddress || (targetAddress === connectedAddress)

  const { data: profile, isLoading: profileLoading, isError: profileError } = useUserProfile(targetAddress)
  const { data: offers, isLoading: offersLoading } = useOffersBySeller(profile?.id)

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const mappedOffers = useMemo<Offer[]>(() => {
    if (!offers) return []
    // useOffersBySeller returns the joined offer+user shape from Supabase;
    // cast through unknown for the loose mapping into the table-friendly shape.
    return offers.map((o) => {
      const row = o as unknown as {
        id: string
        price_per_unit: number | string
        fiat_currency: string
        type: 'buy' | 'sell'
        crypto_token: string
        crypto_amount: number | string
        min_amount: number | string
        max_amount: number | string
        tags?: string[]
        payment_methods?: string[]
        seller?: {
          wallet_address?: string
          nickname?: string | null
          avatar_url?: string | null
          avg_rating?: number | string
          total_trades?: number
        }
      }
      const price = Number(row.price_per_unit) || 0
      const symbol = currencySymbol(row.fiat_currency)
      const sellerAddr = row.seller?.wallet_address ?? '0x0'
      return {
        id: row.id,
        trader: sellerAddr,
        trades: row.seller?.total_trades ?? 0,
        type: row.type,
        token: row.crypto_token,
        amount: String(row.crypto_amount ?? 0),
        price,
        priceDisplay: `${symbol}${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        currency: symbol,
        minAmount: Number(row.min_amount) || 0,
        maxAmount: Number(row.max_amount) || 0,
        isPositive: row.type === 'buy',
        seller: {
          name: row.seller?.nickname ?? sellerAddr,
          address: sellerAddr,
          avatar: row.seller?.avatar_url ?? undefined,
          rating: Number(row.seller?.avg_rating) || 0,
          totalTrades: row.seller?.total_trades ?? 0,
          completionRate: '—',
          tags: row.tags ?? [],
        },
        paymentMethods: row.payment_methods ?? [],
      }
    })
  }, [offers])

  const filteredOffers = useMemo(() => {
    const sorted = [...mappedOffers]
    if (sortKey) {
      sorted.sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      })
    }
    return sorted
  }, [mappedOffers, sortKey, sortDir])

  if (!isConnected && isOwnProfile) {
    return (
      <section className="max-w-xl mx-auto space-y-6 text-center">
        <AppPageHeader title={t('profile.title')} variant="centered" onBack={() => navigate(-1)} />
        <Card>
          <CardContent className="space-y-4">
            <Text variant="h4">{t('profile.connectWallet')}</Text>
            <Text variant="muted" className="text-muted-foreground">
              {t('profile.connectWalletDescription')}
            </Text>
          </CardContent>
        </Card>
      </section>
    )
  }

  if (profileLoading) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {t('profile.loadingProfile')}
      </section>
    )
  }

  if (profileError || !profile) {
    return (
      <section className="max-w-xl mx-auto space-y-6">
        <AppPageHeader title={t('profile.title')} variant="centered" onBack={() => navigate(-1)} />
        <Card>
          <CardContent className="space-y-4">
            <Text variant="body" className="text-destructive">
              {t('profile.errorLoading')}
            </Text>
            <Button className="rounded-full" onClick={() => window.location.reload()}>
              {t('profile.retry')}
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  const nickname = profile.nickname ?? 'Anonymous'
  const walletAddr = profile.wallet_address ?? targetAddress
  const avatarUrl = profile.avatar_url ?? undefined
  const totalTrades = profile.total_trades ?? 0
  const completedTrades = profile.completed_trades ?? 0
  const cancelledTrades = profile.cancelled_trades ?? 0
  const disputeCount = profile.dispute_count ?? 0
  const completionRate = totalTrades > 0 ? `${Math.round((completedTrades / totalTrades) * 100)}%` : '—'
  const lastActive = profile.last_active_at ? new Date(profile.last_active_at).toLocaleDateString() : '—'
  const memberSince = profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <section className="space-y-8">
      {isOwnProfile && (
        <div className="flex">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/app/profile/edit')}
            className="rounded-full shadow-none"
          >
            <Pencil className="w-3.5 h-3.5 mr-1" />
            {t('profile.editProfile')}
          </Button>
        </div>
      )}

      <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
        <Avatar className="h-24 w-24">
          <AvatarImage src={avatarUrl} />
          <AvatarFallback>{nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <Text variant="h2">{nickname}</Text>
            <Badge className="bg-success text-success-foreground hover:bg-success/90 text-sm">
              {lastActive === '—' ? t('profile.offline') : t('profile.online')}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Text variant="small" className="font-mono text-muted-foreground">{formatAddress(walletAddr)}</Text>
            <div className="ml-1 flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(walletAddr)
                  toast.success(t('profile.addressCopied'))
                }}
                title={t('profile.copyAddress')}
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => window.open(`https://blockscan.com/token/${walletAddr}`, '_blank', 'noopener')}
                title={t('profile.openOnBlockscan')}
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {profile.bio && (
            <Text variant="muted" className="mt-2 max-w-2xl">{profile.bio}</Text>
          )}
        </div>
      </div>

      {/* Stats Grid (bento boxes) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Trader Details */}
          <Card>
            <CardContent className="space-y-3">
              <Text variant="h4" className="font-bold">{t('profile.traderDetails')}</Text>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">{t('profile.memberSince')}</span><span>{memberSince}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('profile.totalTrades')}</span><span>{formatNumber(totalTrades)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('profile.completed')}</span><span>{formatNumber(completedTrades)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('profile.cancelled')}</span><span>{formatNumber(cancelledTrades)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('profile.disputes')}</span><span>{formatNumber(disputeCount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('profile.completionRate')}</span><span>{completionRate}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('profile.verification')}</span><span className="capitalize">{profile.verification_level ?? 'unverified'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('profile.reputation')}</span><span>{profile.reputation_score ?? 0}</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Ratings & Feedback */}
          <ReviewList userId={profile.id} />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Total Trades */}
          <Card>
            <CardContent>
              <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground block">{t('profile.totalTrades')}</Text>
              <Text variant="h3" className="mt-1">{formatNumber(totalTrades)}</Text>
            </CardContent>
          </Card>

          {/* Total Volume */}
          <Card>
            <CardContent>
              <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground block">{t('profile.totalVolume')}</Text>
              <Text variant="h3" className="mt-1">{formatVolume(profile.total_volume)}</Text>
            </CardContent>
          </Card>

          {/* Last 30d Stats */}
          <Card>
            <CardContent className="space-y-3">
              <Text variant="h4" className="font-bold">{t('profile.last30Days')}</Text>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">{t('profile.trades')}</span><span>{profile.last_30d_trades ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('profile.volume')}</span><span>{formatVolume(profile.last_30d_volume)}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* User's Offers Table */}
      <div>
        <Text variant="h4" className="mb-4">{isOwnProfile ? t('profile.yourActiveOffers') : t('profile.activeOffers')}</Text>
        <OffersTableWrapper>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50 bg-muted/50 -mx-3 md:-mx-4 px-3 md:px-4">
                <TableHead>{t('profile.tableType')}</TableHead>
                <TableHead>{t('profile.tableToken')}</TableHead>
                <TableHead className="text-right">
                  <SortableHeader label={t('profile.tablePrice')} sortField="price" sortKey={sortKey} onToggle={toggleSort} />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader label={t('profile.tableMinAmount')} sortField="minAmount" sortKey={sortKey} onToggle={toggleSort} />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader label={t('profile.tableMaxAmount')} sortField="maxAmount" sortKey={sortKey} onToggle={toggleSort} />
                </TableHead>
                <TableHead>{t('profile.tableAction')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offersLoading ? (
                <TableRow className="border-b border-border/50">
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                    {t('profile.loadingOffers')}
                  </TableCell>
                </TableRow>
              ) : filteredOffers.length === 0 ? (
                <TableRow className="border-b border-border/50">
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    {t('profile.noActiveOffers')}{isOwnProfile && <Button className="rounded-full shadow-none ml-2" onClick={() => navigate('/app/create-offer')}>{t('profile.createOne')}</Button>}
                  </TableCell>
                </TableRow>
              ) : (
                filteredOffers.map((offer) => (
                  <TableRow
                    key={offer.id}
                    onClick={() => navigate(`/app/offer/${offer.id}`)}
                    className="hover:bg-muted/50 transition-colors border-b border-border/50 cursor-pointer"
                  >
                    <TableCell>
                      <Badge variant={offer.type === 'buy' ? 'default' : 'secondary'} className="rounded-full">
                        {offer.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{offer.token}</TableCell>
                    <TableCell className="text-right font-mono">{offer.priceDisplay}</TableCell>
                    <TableCell className="text-right font-mono">{offer.currency}{offer.minAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{offer.currency}{offer.maxAmount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Button size="sm" className="rounded-full shadow-none" onClick={(e) => { e.stopPropagation(); navigate(`/app/offer/${offer.id}/edit`) }}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </OffersTableWrapper>
      </div>
    </section>
  )
}