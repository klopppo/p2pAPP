import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useOffers } from '@/hooks/useOffers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { OffersTableWrapper } from '@/components/custom/OffersTableWrapper'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { SellerHoverCard, type SellerPreview } from '@/components/custom/SellerHoverCard'
import { FullDropdown } from '@/components/custom/FullDropdown'
import { MaskedList, useInfiniteList } from '@/components/infinite-list'
import { ArrowUpDown, Loader2 } from 'lucide-react'

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
  seller: SellerPreview
}

type SortKey = 'price' | 'minAmount' | 'maxAmount'
type SortDir = 'asc' | 'desc'

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
const currencySymbol = (code: string) => CURRENCY_SYMBOLS[code] ?? `${code} `

// Shape returned by getActiveOffers() (select * + joined seller). NUMERIC
// columns arrive as strings from PostgREST, so they are coerced with Number().
interface OfferRow {
  id: string
  type: 'buy' | 'sell'
  crypto_token: string
  crypto_amount: number | string
  fiat_currency: string
  price_per_unit: number | string
  min_amount: number | string
  max_amount: number | string
  tags?: string[] | null
  seller?: {
    wallet_address?: string
    nickname?: string | null
    avatar_url?: string | null
    total_trades?: number
    avg_rating?: number | string | null
  } | null
}

function mapOfferRow(o: OfferRow): Offer {
  const price = Number(o.price_per_unit) || 0
  const sellerAddr = o.seller?.wallet_address ?? '0x0'
  const symbol = currencySymbol(o.fiat_currency)
  return {
    id: o.id,
    trader: sellerAddr,
    trades: o.seller?.total_trades ?? 0,
    type: o.type,
    token: o.crypto_token,
    amount: String(o.crypto_amount ?? 0),
    price,
    priceDisplay: `${symbol}${price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
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
  }
}

const PAGE_SIZE = 10

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

export function OffersPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useOffers()
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [tokenFilter, setTokenFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const offers = useMemo<Offer[]>(() => (data ?? []).map(mapOfferRow), [data])
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const list = useInfiniteList({ pageSize: PAGE_SIZE })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Derive payment methods from actual offers for filter options
  const availablePaymentMethods = useMemo(() => {
    const methods = new Set<string>()
    offers.forEach((o) => {
      const offer = data?.find((d: any) => d.id === o.id)
      if (offer?.payment_methods) {
        (offer.payment_methods as string[]).forEach((m: string) => methods.add(m.toLowerCase()))
      }
    })
    return Array.from(methods)
  }, [offers, data])

  const filteredOffers = useMemo(() => {
    const filtered = offers.filter((offer) => {
      const matchesSearch =
        offer.trader.toLowerCase().includes(searchQuery.toLowerCase()) ||
        offer.token.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = typeFilter === 'all' || offer.type === typeFilter
      const matchesToken = tokenFilter === 'all' || offer.token === tokenFilter
      // Payment filter - check if any offer payment method contains the filter value
      const matchesPayment =
        paymentFilter === 'all' ||
        (() => {
          const offer = data?.find((d: any) => d.id === offer.id)
          if (!offer?.payment_methods) return true
          return (offer.payment_methods as string[]).some(
            (m: string) => m.toLowerCase().includes(paymentFilter.toLowerCase())
          )
        })()
      return matchesSearch && matchesType && matchesToken && matchesPayment
    })

    if (sortKey) {
      filtered.sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      })
    }

    return filtered
  }, [offers, searchQuery, typeFilter, tokenFilter, sortKey, sortDir])

  const loadMore = () => {
    list.nextPage()
  }

  return (
    <section>
            {/* Header */}
            <AppPageHeader
              title="Offers"
              subtitle="Browse and create trade offers"
              variant="split"
              action={
                <Link to="/app/create-offer">
                  <Button className="rounded-full shadow-none">Create Offer</Button>
                </Link>
              }
            />

            {/* Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <Input
                placeholder="Search offers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-xs rounded-full border-border"
              />
              <div className="flex items-center gap-3">
                <FullDropdown
                  label="Type"
                  value={typeFilter}
                  onSelect={setTypeFilter}
                  options={[
                    { label: 'All', value: 'all' },
                    { label: 'Buy', value: 'buy' },
                    { label: 'Sell', value: 'sell' },
                  ]}
                />
                <FullDropdown
                  label="Token"
                  value={tokenFilter}
                  onSelect={setTokenFilter}
                  options={[
                    { label: 'All', value: 'all' },
                    { label: 'ETH', value: 'ETH' },
                    { label: 'BTC', value: 'BTC' },
                    { label: 'USDC', value: 'USDC' },
                  ]}
                />
                <FullDropdown
                  label="Payment"
                  value={paymentFilter}
                  onSelect={setPaymentFilter}
                  options={[
                    { label: 'All', value: 'all' },
                    { label: 'Bank Transfer', value: 'bank' },
                    { label: 'PayPal', value: 'paypal' },
                    { label: 'Wise', value: 'wise' },
                  ]}
                />
              </div>
            </div>

            {/* Table */}
            <OffersTableWrapper>
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50 bg-muted/50 -mx-6 md:-mx-8 px-6 md:px-8">
                    <TableHead>Trader</TableHead>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow className="border-b border-border/50">
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                        Loading offers…
                      </TableCell>
                    </TableRow>
                  ) : isError ? (
                    <TableRow className="border-b border-border/50">
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        Couldn’t load offers. Please try again.
                      </TableCell>
                    </TableRow>
                  ) : filteredOffers.length === 0 ? (
                    <TableRow className="border-b border-border/50">
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        No offers match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                  <MaskedList {...list}>
                    {filteredOffers.map((offer) => (
                      <TableRow
                        key={offer.id}
                        onClick={() => navigate(`/app/offer/${offer.id}`)}
                        className="hover:bg-muted/50 transition-colors border-b border-border/50 cursor-pointer"
                      >
                        <TableCell>
                          <SellerHoverCard seller={offer.seller}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                  {offer.trader.slice(2, 4).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-mono text-sm">
                                  {offer.trader.slice(0, 6)}...{offer.trader.slice(-4)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {offer.trades} trades
                                </div>
                              </div>
                            </div>
                          </SellerHoverCard>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={offer.type === 'buy' ? 'default' : 'secondary'}
                            className="rounded-full"
                          >
                            {offer.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{offer.token}</TableCell>
                        <TableCell className="text-right font-mono">{offer.priceDisplay}</TableCell>
                        <TableCell className="text-right font-mono">{offer.currency}{offer.minAmount.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">{offer.currency}{offer.maxAmount.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </MaskedList>
                  )}
                </TableBody>
              </Table>
            </OffersTableWrapper>

            {/* Load More */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {Math.min(list.displayLimit, filteredOffers.length)} of {filteredOffers.length} offers
              </div>
              {list.displayLimit < filteredOffers.length && (
                <Button
                  onClick={loadMore}
                  variant="outline"
                  className="rounded-full shadow-none"
                >
                  Load More
                </Button>
              )}
            </div>
          </section>
  )
}
