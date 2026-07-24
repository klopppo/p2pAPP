import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Copy, ExternalLink, Loader2 } from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { OffersTableWrapper } from '@/components/custom/OffersTableWrapper'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { FullDropdown } from '@/components/custom/FullDropdown'
import { Text } from '@/components/ui/text'
import { ArrowUpDown, MoreVertical, UserPlus, MessageCircle, Flag, BellOff, ShieldAlert } from 'lucide-react'
import { useUserProfile, useOffersBySeller } from '@/hooks/useOffers'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { Offer } from '@/hooks/useOffers'

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
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { data: currentUser } = useCurrentUser()
  const { data: profile, isLoading: profileLoading, isError: profileError } = useUserProfile(address)
  const { data: offers, isLoading: offersLoading } = useOffersBySeller(currentUser?.id)

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [isFollowing, setIsFollowing] = useState(false)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const mappedOffers = useMemo(() => {
    if (!offers) return []
    return offers.map((o: any) => {
      const price = Number(o.price_per_unit) || 0
      const symbol = currencySymbol(o.fiat_currency)
      const sellerAddr = o.seller?.wallet_address ?? '0x0'
      return {
        id: o.id,
        trader: sellerAddr,
        trades: o.seller?.total_trades ?? 0,
        type: o.type,
        token: o.crypto_token,
        amount: String(o.crypto_amount ?? 0),
        price,
        priceDisplay: `${symbol}${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        currency: symbol,
        minAmount: Number(o.min_amount) || 0,
        maxAmount: Number(o.max_amount) || 0,
        isPositive: o.type === 'buy',
        seller: {
          name: o.seller?.nickname ?? sellerAddr,
          address: sellerAddr,
          avatar: o.seller?.avatar_url ?? undefined,
          rating: Number(o.seller?.avg_rating) || 0,
          totalTrades: o.seller?.total_trades ?? 0,
          completionRate: '—',
          tags: o.tags ?? [],
        },
        paymentMethods: o.payment_methods ?? [],
      } as Offer
    })
  }, [offers])

  const filteredOffers = useMemo(() => {
    let sorted = [...mappedOffers]
    if (sortKey) {
      sorted.sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      })
    }
    return sorted
  }, [mappedOffers, sortKey, sortDir])

  if (!isConnected || !address) {
    return (
      <section className="max-w-xl mx-auto space-y-6 text-center">
        <AppPageHeader title="Profile" variant="centered" onBack={() => navigate(-1)} />
        <Card>
          <CardContent className="p-6 space-y-4">
            <Text variant="h4">Connect your wallet</Text>
            <Text variant="muted" className="text-muted-foreground">
              Connect a wallet to view your profile, stats, and offers.
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
        Loading profile…
      </section>
    )
  }

  if (profileError || !profile) {
    return (
      <section className="max-w-xl mx-auto space-y-6">
        <AppPageHeader title="Profile" variant="centered" onBack={() => navigate(-1)} />
        <Card>
          <CardContent className="p-6 space-y-4">
            <Text variant="body" className="text-destructive">
              Couldn't load profile. Please try again.
            </Text>
            <Button className="rounded-full" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  const nickname = profile.nickname ?? 'Anonymous'
  const walletAddr = profile.wallet_address ?? address
  const avatarUrl = profile.avatar_url ?? undefined
  const rating = Number(profile.avg_rating) || 0
  const totalTrades = profile.total_trades ?? 0
  const completedTrades = profile.completed_trades ?? 0
  const cancelledTrades = profile.cancelled_trades ?? 0
  const disputeCount = profile.dispute_count ?? 0
  const completionRate = totalTrades > 0 ? `${Math.round((completedTrades / totalTrades) * 100)}%` : '—'
  const lastActive = profile.last_active_at ? new Date(profile.last_active_at).toLocaleDateString() : '—'
  const memberSince = profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <section className="space-y-8">
      {/* Profile Header */}
      <AppPageHeader
        title="Profile"
        subtitle={profile.bio ?? 'Your P2P trading profile'}
        variant="split"
        action={
          <Button onClick={() => navigate('/app/profile/edit')} className="rounded-full shadow-none">
            Edit Profile
          </Button>
        }
      />

      <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
        <Avatar className="h-24 w-24">
          <AvatarImage src={avatarUrl} />
          <AvatarFallback>{nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Text variant="h2">{nickname}</Text>
            <Badge className="bg-success text-success-foreground hover:bg-success/90 text-sm">
              {lastActive === '—' ? 'Offline' : 'Online'}
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
                  toast.success('Address copied')
                }}
                title="Copy address"
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => window.open(`https://blockscan.com/token/${walletAddr}`, '_blank', 'noopener')}
                title="Open on Blockscan"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid (bento boxes) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Trader Details */}
          <Card>
            <CardContent className="p-6 space-y-3">
              <Text variant="h4" className="font-bold">Trader Details</Text>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Member since</span><span>{memberSince}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Trades</span><span>{formatNumber(totalTrades)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span>{formatNumber(completedTrades)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cancelled</span><span>{formatNumber(cancelledTrades)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Disputes</span><span>{formatNumber(disputeCount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Completion rate</span><span>{completionRate}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Verification</span><span className="capitalize">{profile.verification_level ?? 'unverified'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Reputation</span><span>{profile.reputation_score ?? 0}</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Ratings & Feedback */}
          <Card>
            <CardContent className="p-6 space-y-3">
              <Text variant="h4" className="font-bold">Ratings & Feedback</Text>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Rating</span><span className="font-mono">{rating.toFixed(2)} <span className="text-primary">★</span></span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Unique traders</span><span>{profile.unique_traders ?? 0}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Total Trades */}
          <Card>
            <CardContent className="p-6">
              <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground block">Total Trades</Text>
              <Text variant="h3" className="mt-1">{formatNumber(totalTrades)}</Text>
            </CardContent>
          </Card>

          {/* Total Volume */}
          <Card>
            <CardContent className="p-6">
              <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground block">Total Volume</Text>
              <Text variant="h3" className="mt-1">{formatVolume(profile.total_volume)}</Text>
            </CardContent>
          </Card>

          {/* Last 30d Stats */}
          <Card>
            <CardContent className="p-6 space-y-3">
              <Text variant="h4" className="font-bold">Last 30 Days</Text>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Trades</span><span>{profile.last_30d_trades ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Volume</span><span>{formatVolume(profile.last_30d_volume)}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* User's Offers Table */}
      <div>
        <Text variant="h4" className="mb-4">Your active offers</Text>
        <OffersTableWrapper>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50 bg-muted/50 -mx-3 md:-mx-4 px-3 md:px-4">
                <TableHead>Type</TableHead>
                <TableHead>Token</TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Price" sortField="price" sortKey={sortKey} onToggle={toggleSort} />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Min Amount" sortField="minAmount" sortKey={sortKey} onToggle={toggleSort} />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Max Amount" sortField="maxAmount" sortKey={sortKey} onToggle={toggleSort} />
                </TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offersLoading ? (
                <TableRow className="border-b border-border/50">
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                    Loading offers…
                  </TableCell>
                </TableRow>
              ) : filteredOffers.length === 0 ? (
                <TableRow className="border-b border-border/50">
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    No active offers. <Button className="rounded-full shadow-none ml-2" onClick={() => navigate('/app/create-offer')}>Create one</Button>
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