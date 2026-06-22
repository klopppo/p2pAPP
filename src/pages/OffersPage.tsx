import { useState, useTransition, useMemo } from 'react'
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
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { PageContainer } from '@/components/layout/PageContainer'
import { Text } from '@/components/ui/text'
import { MaskedList, useInfiniteList } from '@/components/infinite-list'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  const minAmount = Math.floor(Math.random() * 500) + 10
  const maxAmount = minAmount + Math.floor(Math.random() * 5000) + 100

  return {
    id: index + 1,
    trader,
    trades: Math.floor(Math.random() * 300),
    type,
    token,
    amount: token === 'BTC' ? (Math.random() * 2).toFixed(3) : token === 'ETH' ? (Math.random() * 10).toFixed(2) : Math.floor(Math.random() * 50000).toString(),
    price,
    priceDisplay: token === 'USDC' || token === 'USDT' || token === 'DAI' ? '$1.00' : `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    minAmount,
    maxAmount,
    isPositive,
  }
}

const PAGE_SIZE = 10
const INITIAL_OFFERS = Array.from({ length: PAGE_SIZE }, (_, i) => generateOffer(i))

function generateMoreOffers(offset: number, count: number): Offer[] {
  return Array.from({ length: count }, (_, i) => generateOffer(offset + i))
}

export function OffersPage() {
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
    <div className="relative z-10 min-h-screen flex flex-col">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-3/4 left-1/2 w-96 h-96 bg-blue-900/20 rounded-full blur-[120px]" />
      </div>

      <Navbar showTabs />
      <main className="flex-1">
        <PageContainer type="app">
          <section className="py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <Text variant="h3">Offers</Text>
                <Text variant="muted">Browse and create trade offers</Text>
              </div>
              <Button className="rounded-full shadow-none">Create Offer</Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <Input
                placeholder="Search offers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-xs rounded-full border-border"
              />
              <div className="flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="rounded-full border-border shadow-none"
                    >
                      Type: {typeFilter}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-card border-border shadow-none rounded-2xl">
                    <DropdownMenuItem onClick={() => setTypeFilter('all')}>All</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTypeFilter('buy')}>Buy</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTypeFilter('sell')}>Sell</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="rounded-full border-border shadow-none"
                    >
                      Token: {tokenFilter}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-card border-border shadow-none rounded-2xl">
                    <DropdownMenuItem onClick={() => setTokenFilter('all')}>All</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTokenFilter('ETH')}>ETH</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTokenFilter('BTC')}>BTC</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTokenFilter('USDC')}>USDC</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="rounded-full border-border shadow-none"
                    >
                      Payment: {paymentFilter}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-card border-border shadow-none rounded-2xl">
                    <DropdownMenuItem onClick={() => setPaymentFilter('all')}>All</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPaymentFilter('bank')}>Bank Transfer</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPaymentFilter('paypal')}>PayPal</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPaymentFilter('wise')}>Wise</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Table */}
            <OffersTableWrapper>
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50 bg-muted/50 -mx-6 md:-mx-8 px-6 md:px-8">
                    <TableHead className="text-muted-foreground font-mono">#</TableHead>
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
                    {filteredOffers.map((offer, index) => (
                      <TableRow
                        key={offer.id}
                        className="hover:bg-muted/50 transition-colors border-b border-border/50"
                      >
                        <TableCell className="text-muted-foreground font-mono">
                          {index + 1}
                        </TableCell>
                        <TableCell>
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
        </PageContainer>
      </main>
      <Footer />
    </div>
  )
}
