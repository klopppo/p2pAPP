import { useState } from 'react'
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
import { MiniSparkline } from '@/components/custom/MiniSparkline'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { PageContainer } from '@/components/layout/PageContainer'
import { SectionHeader } from '@/components/ui/section-header'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const mockOffers = [
  {
    id: 1,
    trader: '0x1234567890abcdef',
    trades: 156,
    type: 'buy',
    token: 'ETH',
    amount: '1.5',
    price: '$2,847.50',
    change: '+2.4%',
    isPositive: true,
    volume: '$42,712',
    sparkline: [2800, 2820, 2810, 2830, 2840, 2847],
  },
  {
    id: 2,
    trader: '0xabcdef1234567890',
    trades: 89,
    type: 'sell',
    token: 'USDC',
    amount: '5000',
    price: '$1.00',
    change: '+0.1%',
    isPositive: true,
    volume: '$5,000',
    sparkline: [100, 100, 100, 100, 100, 100],
  },
  {
    id: 3,
    trader: '0x567890abcdef1234',
    trades: 234,
    type: 'buy',
    token: 'BTC',
    amount: '0.25',
    price: '$52,340.00',
    change: '-1.2%',
    isPositive: false,
    volume: '$13,085',
    sparkline: [53000, 52800, 52600, 52500, 52400, 52340],
  },
  {
    id: 4,
    trader: '0xfedcba0987654321',
    trades: 45,
    type: 'sell',
    token: 'ETH',
    amount: '3.0',
    price: '$2,850.00',
    change: '+0.5%',
    isPositive: true,
    volume: '$8,550',
    sparkline: [2840, 2845, 2848, 2850, 2852, 2850],
  },
  {
    id: 5,
    trader: '0x9876543210fedcba',
    trades: 178,
    type: 'buy',
    token: 'USDC',
    amount: '10000',
    price: '$1.00',
    change: '0.0%',
    isPositive: true,
    volume: '$10,000',
    sparkline: [100, 100, 100, 100, 100, 100],
  },
]

export function OffersPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [tokenFilter, setTokenFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')

  const filteredOffers = mockOffers.filter((offer) => {
    const matchesSearch =
      offer.trader.toLowerCase().includes(searchQuery.toLowerCase()) ||
      offer.token.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = typeFilter === 'all' || offer.type === typeFilter
    const matchesToken =
      tokenFilter === 'all' || offer.token === tokenFilter
    return matchesSearch && matchesType && matchesToken
  })

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
              <SectionHeader
                title="Offers"
                align="left"
              />
              <Button className="rounded-full shadow-none">Create Offer</Button>
            </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Input
            placeholder="Search offers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs rounded-full border-border"
          />
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
              <DropdownMenuItem onClick={() => setTypeFilter('all')}>
                All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTypeFilter('buy')}>
                Buy
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTypeFilter('sell')}>
                Sell
              </DropdownMenuItem>
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
              <DropdownMenuItem onClick={() => setTokenFilter('all')}>
                All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTokenFilter('ETH')}>
                ETH
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTokenFilter('BTC')}>
                BTC
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTokenFilter('USDC')}>
                USDC
              </DropdownMenuItem>
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
              <DropdownMenuItem onClick={() => setPaymentFilter('all')}>
                All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPaymentFilter('bank')}>
                Bank Transfer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPaymentFilter('paypal')}>
                PayPal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPaymentFilter('wise')}>
                Wise
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Table */}
        <OffersTableWrapper>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50">
                <TableHead className="text-muted-foreground font-mono">
                  #
                </TableHead>
                <TableHead>Trader</TableHead>
                <TableHead>Type/Token</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">1D Change</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead>Chart</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                    </Badge>{' '}
                    <span className="ml-1">{offer.token}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {offer.amount}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {offer.price}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono ${
                      offer.isPositive ? 'text-[#22c55e]' : 'text-[#ef4444]'
                    }`}
                  >
                    {offer.change}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground font-mono">
                    {offer.volume}
                  </TableCell>
                  <TableCell>
                    <MiniSparkline
                      data={offer.sparkline}
                      color={offer.isPositive ? '#22c55e' : '#ef4444'}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" className="rounded-full shadow-none">
                      Trade
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </OffersTableWrapper>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            Showing {filteredOffers.length} of {mockOffers.length} offers
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="rounded-full">
              Previous
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full">
              1
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full">
              2
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full">
              Next
            </Button>
          </div>
        </div>
          </section>
        </PageContainer>
      </main>
      <Footer />
    </div>
  )
}
