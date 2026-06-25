import { useState, useTransition, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { Text } from '@/components/ui/text'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { SellerHoverCard, type SellerPreview } from '@/components/custom/SellerHoverCard'
import { FullDropdown } from '@/components/custom/FullDropdown'
import { MaskedList, useInfiniteList } from '@/components/infinite-list'
import { ArrowUpDown } from 'lucide-react'

interface Offer {
  id: number
  trader: string
  trades: number
  type: 'buy' | 'sell'
  token: string
  amount: string
  price: number
  priceDisplay: string
  minAmount: number
  maxAmount: number
  isPositive: boolean
  seller: SellerPreview
}

type SortKey = 'price' | 'minAmount' | 'maxAmount'
type SortDir = 'asc' | 'desc'

const generateOffer = (index: number): Offer => {
  const tokens = ['ETH', 'BTC', 'USDC', 'USDT', 'DAI']
  const types: ('buy' | 'sell')[] = ['buy', 'sell']
  const token = tokens[index % tokens.length]
  const type = types[index % 2]
  const isPositive = index % 3 !== 2
  const basePrice = token === 'BTC' ? 52000 : token === 'ETH' ? 2800 : 1
  const price = basePrice + (Math.random() * 100 - 50)
  const hex = () => Math.floor(Math.random() * 16).toString(16)
  const trader = `0x${Array.from({ length: 16 }, hex).join('')}`
  const trades = Math.floor(Math.random() * 300)
  const minAmount = Math.floor(Math.random() * 500) + 10
  const maxAmount = minAmount + Math.floor(Math.random() * 5000) + 100

  // Mock seller data
  const names = ['CryptoKing', 'FastTrader', 'TrustSeller', 'QuickSwap', 'SafeTrade']
  const ratings = [4.5, 4.7, 4.9, 4.95, 5.0]
  const completionRates = ['95%', '98%', '100%', '100%', '99%']
  const tagsOptions = [
    ['Fast', 'Verified'],
    ['No KYC', 'Trusted'],
    ['Instant'],
    ['Fast', 'No KYC'],
    ['Verified'],
  ]

  const seller: SellerPreview = {
    name: names[index % names.length],
    address: trader,
    rating: ratings[index % ratings.length],
    totalTrades: trades,
    completionRate: completionRates[index % completionRates.length],
    tags: tagsOptions[index % tagsOptions.length],
  }

  return {
    id: index + 1,
    trader,
    trades,
    type,
    token,
    amount: token === 'BTC' ? (Math.random() * 2).toFixed(3) : token === 'ETH' ? (Math.random() * 10).toFixed(2) : Math.floor(Math.random() * 50000).toString(),
    price,
    priceDisplay: token === 'USDC' || token === 'USDT' || token === 'DAI' ? '$1.00' : `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    minAmount,
    maxAmount,
    isPositive,
    seller,
  }
}

const PAGE_SIZE = 10
const INITIAL_OFFERS = Array.from({ length: PAGE_SIZE }, (_, i) => generateOffer(i))

function generateMoreOffers(offset: number, count: number): Offer[] {
  return Array.from({ length: count }, (_, i) => generateOffer(offset + i))
}

export function OffersPage() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [tokenFilter, setTokenFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [offers, setOffers] = useState<Offer[]>(INITIAL_OFFERS)
  const [isPending, startTransition] = useTransition()
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const list = useInfiniteList({ pageSize: PAGE_SIZE, initialItems: INITIAL_OFFERS })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filteredOffers = useMemo(() => {
    const filtered = offers.filter((offer) => {
      const matchesSearch =
        offer.trader.toLowerCase().includes(searchQuery.toLowerCase()) ||
        offer.token.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = typeFilter === 'all' || offer.type === typeFilter
      const matchesToken = tokenFilter === 'all' || offer.token === tokenFilter
      return matchesSearch && matchesType && matchesToken
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
    startTransition(() => {
      const newOffers = generateMoreOffers(list.offset, PAGE_SIZE)
      setOffers((prev) => [...prev, ...newOffers])
    })
  }

  const SortableHeader = ({ label, sortField }: { label: string; sortField: SortKey }) => (
    <button
      onClick={() => toggleSort(sortField)}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
    >
      {label}
      <ArrowUpDown className={`w-3.5 h-3.5 ${sortKey === sortField ? 'text-foreground' : 'text-muted-foreground/50'}`} />
    </button>
  )

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
                      <SortableHeader label="Price" sortField="price" />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortableHeader label="Min Amount" sortField="minAmount" />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortableHeader label="Max Amount" sortField="maxAmount" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <MaskedList {...list}>
                    {filteredOffers.map((offer) => (
                      <TableRow
                        key={offer.id}
                        onClick={() => navigate(`/app/trade/${offer.id}`)}
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
                        <TableCell className="text-right font-mono">${offer.minAmount.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">${offer.maxAmount.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </MaskedList>
                </TableBody>
              </Table>
            </OffersTableWrapper>

            {/* Load More */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {Math.min(list.displayLimit, filteredOffers.length)} of {filteredOffers.length} offers
              </div>
              <Button
                onClick={loadMore}
                disabled={isPending}
                variant="outline"
                className="rounded-full shadow-none"
              >
                {isPending ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          </section>
  )
}
