import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
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
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { PageContainer } from '@/components/layout/PageContainer'
import { ArrowUpDown } from 'lucide-react'

interface Offer {
  id: number
  trader: string
  type: 'buy' | 'sell'
  token: string
  price: number
  priceDisplay: string
  minAmount: number
  maxAmount: number
}

interface ProfileData {
  name: string
  address: string
  memberSince: string
  lastOnline: string
  timezone: string
  languages: string[]
  blockedBy: number
  trustedBy: number
  following: number
  rating: number
  totalTrades: number
  uniqueTraders: number
  importedTrades: number
  importedVolume: string
  totalVolume: string
  last30dTrades: number
  last30dVolume: string
  completionRate: string
  avatar: string
}

const generateUserOffers = (): Offer[] => [
  { id: 1, trader: '0x1234567890abcdef', type: 'sell', token: 'ETH', price: 2847.50, priceDisplay: '$2,847.50', minAmount: 100, maxAmount: 5000 },
  { id: 2, trader: '0x1234567890abcdef', type: 'buy', token: 'BTC', price: 52340.00, priceDisplay: '$52,340.00', minAmount: 5000, maxAmount: 50000 },
  { id: 3, trader: '0x1234567890abcdef', type: 'sell', token: 'USDC', price: 1.00, priceDisplay: '$1.00', minAmount: 100, maxAmount: 10000 },
]

const PROFILE_DATA: ProfileData = {
  name: 'CryptoKing',
  address: '0xabcdef1234567890abcdef1234567890abcdef1234',
  memberSince: 'Feb 25, 2021',
  lastOnline: 'Online',
  timezone: 'Europe/Madrid',
  languages: ['English'],
  blockedBy: 9,
  trustedBy: 2103,
  following: 42,
  rating: 4.96,
  totalTrades: 29006,
  uniqueTraders: 5801,
  importedTrades: 3000,
  importedVolume: '$4,200,000.00+ USD',
  totalVolume: '$32,052,954.00 USD',
  last30dTrades: 913,
  last30dVolume: '$799,386.00 USD',
  completionRate: '100%',
  avatar: 'https://images.unsplash.com/photo-1472099645745-095597429a3b?auto=format&fit=crop&q=80&w=100&h=100',
}

const SortableHeader = ({ label, sortField, activeKey, sortDir, onClick }: { label: string; sortField: string; activeKey: string | null; sortDir: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
  >
    {label}
    <ArrowUpDown className={`w-3.5 h-3.5 ${activeKey === sortField ? 'text-foreground' : 'text-muted-foreground/50'}`} />
  </button>
)

export function ProfilePage({ isOwn = false }: { isOwn?: boolean }) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [userOffers] = useState<Offer[]>(generateUserOffers())

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filteredOffers = useMemo(() => {
    const sorted = [...userOffers]
    if (sortKey) {
      sorted.sort((a, b) => {
        const aVal = a[sortKey as keyof Offer] as number
        const bVal = b[sortKey as keyof Offer] as number
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      })
    }
    return sorted
  }, [userOffers, sortKey, sortDir])

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
          <section className="py-8 space-y-8">
            {/* Profile Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src={PROFILE_DATA.avatar} />
                <AvatarFallback>{PROFILE_DATA.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold">{PROFILE_DATA.name}</h1>
                  <Badge className="bg-green-500 text-white hover:bg-green-600 text-sm">{PROFILE_DATA.lastOnline}</Badge>
                </div>
                <p className="text-sm text-muted-foreground font-mono">{PROFILE_DATA.address}</p>
                {isOwn && <Button className="mt-4">Edit Profile</Button>}
              </div>
            </div>

            {/* Stats Grid (bento boxes) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Big stat card: Total Trades */}
              <Card className="md:col-span-2">
                <CardContent className="pt-6">
                  <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Total Trades</p>
                  <p className="text-5xl font-black mt-2">{PROFILE_DATA.totalTrades.toLocaleString()}</p>
                </CardContent>
              </Card>
              {/* Big stat card: Total Volume */}
              <Card className="md:col-span-2">
                <CardContent className="pt-6">
                  <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Total Volume</p>
                  <p className="text-5xl font-black mt-2">{PROFILE_DATA.totalVolume}</p>
                </CardContent>
              </Card>
              {/* Trader Details */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-base font-bold mb-4">Trader Details</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between"><span className="text-muted-foreground">Member since</span><span>{PROFILE_DATA.memberSince}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Timezone</span><span>{PROFILE_DATA.timezone}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Languages</span><span>{PROFILE_DATA.languages.join(', ')}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Blocked by</span><span>{PROFILE_DATA.blockedBy} traders</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Trusted by</span><span>{PROFILE_DATA.trustedBy.toLocaleString()} traders</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Following</span><button className="text-primary">{PROFILE_DATA.following} — View list</button></div>
                  </div>
                </CardContent>
              </Card>
              {/* Ratings & Feedback */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-base font-bold mb-4">Ratings & Feedback</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between"><span className="text-muted-foreground">Rating</span><button className="text-primary">{PROFILE_DATA.rating} — View feedback</button></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Unique traders</span><span>{PROFILE_DATA.uniqueTraders.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Completion rate</span><span>{PROFILE_DATA.completionRate}</span></div>
                  </div>
                </CardContent>
              </Card>
              {/* Volume & Activity */}
              <Card className="md:col-span-2">
                <CardContent className="pt-6">
                  <h3 className="text-base font-bold mb-4">Volume & Activity</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex justify-between"><span className="text-muted-foreground">Imported trades</span><span>{PROFILE_DATA.importedTrades}+</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Imported volume</span><span>{PROFILE_DATA.importedVolume}</span></div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between"><span className="text-muted-foreground">Last 30d Trades</span><span>{PROFILE_DATA.last30dTrades}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Last 30d Volume</span><span>{PROFILE_DATA.last30dVolume}</span></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* User's Offers Table */}
            <div>
              <h2 className="text-xl font-bold mb-4">{isOwn ? 'Your active offers' : `${PROFILE_DATA.name}'s offers`}</h2>
              <OffersTableWrapper>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/50 bg-muted/50 -mx-3 md:-mx-4 px-3 md:px-4">
                      <TableHead className="text-muted-foreground font-mono">#</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Token</TableHead>
                      <TableHead className="text-right">
                        <SortableHeader label="Price" sortField="price" activeKey={sortKey} sortDir={sortDir} onClick={() => toggleSort('price')} />
                      </TableHead>
                      <TableHead className="text-right">
                        <SortableHeader label="Min Amount" sortField="minAmount" activeKey={sortKey} sortDir={sortDir} onClick={() => toggleSort('minAmount')} />
                      </TableHead>
                      <TableHead className="text-right">
                        <SortableHeader label="Max Amount" sortField="maxAmount" activeKey={sortKey} sortDir={sortDir} onClick={() => toggleSort('maxAmount')} />
                      </TableHead>
                      {isOwn && <TableHead>Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOffers.map((offer, index) => (
                      <TableRow
                        key={offer.id}
                        className="hover:bg-muted/50 transition-colors border-b border-border/50"
                      >
                        <TableCell className="text-muted-foreground font-mono">{index + 1}</TableCell>
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
                        {isOwn && (
                          <TableCell><Button size="sm" className="rounded-full shadow-none">Edit</Button></TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </OffersTableWrapper>
            </div>
          </section>
        </PageContainer>
      </main>
      <Footer />
    </div>
  )
}
