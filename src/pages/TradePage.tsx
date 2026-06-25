import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { ShieldCheck, Clock, Globe, Tag } from 'lucide-react'

interface OfferDetail {
  id: number
  type: 'buy' | 'sell'
  cryptoToken: string
  cryptoAmount: number
  fiatCurrency: string
  fiatAmount: number
  pricePerUnit: number
  minAmount: number
  maxAmount: number
  paymentMethods: string[]
  availableRegions: string[]
  network: string
  platformFeeBps: number
  networkFee: number
  premiumMultiplier: number | null
  tags: string[]
  expiresAt: string
  description: string
}

interface Seller {
  name: string
  address: string
  avatar: string
  rating: number
  totalTrades: number
  completionRate: string
  trustedBy: number
}

const OFFER: OfferDetail = {
  id: 1,
  type: 'sell',
  cryptoToken: 'ETH',
  cryptoAmount: 2.5,
  fiatCurrency: 'EUR',
  fiatAmount: 7118.75,
  pricePerUnit: 2847.5,
  minAmount: 100,
  maxAmount: 5000,
  paymentMethods: ['SEPA Instant', 'Bank Transfer', 'Wise'],
  availableRegions: ['IT', 'ES', 'FR', 'DE'],
  network: 'Arbitrum',
  platformFeeBps: 50,
  networkFee: 0.42,
  premiumMultiplier: 1.02,
  tags: ['Fast', 'Verified', 'No KYC'],
  expiresAt: 'in 3 days',
  description:
    'Selling ETH for EUR via SEPA Instant. Usually available 9am–9pm CET. Funds released within minutes after payment confirmation. Trusted trader, 2000+ completed trades.',
}

const SELLER: Seller = {
  name: 'CryptoKing',
  address: '0xabcdef1234567890abcdef1234567890abcdef12',
  avatar: 'https://images.unsplash.com/photo-1472099645745-095597429a3b?auto=format&fit=crop&q=80&w=100&h=100',
  rating: 4.96,
  totalTrades: 29006,
  completionRate: '100%',
  trustedBy: 2103,
}

export function TradePage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`
  const feePercent = (OFFER.platformFeeBps / 100).toFixed(2)

  return (
    <section className="space-y-8">
      {/* Centered column — header + cards share the same constrained width */}
      <div className="max-w-xl mx-auto space-y-6">
        <AppPageHeader
          title="Buy ETH"
          subtitle={`sell · Offer #${OFFER.id}`}
          variant="centered"
          onBack={() => navigate(-1)}
        />
        <div className="space-y-4">
        {/* Unified main card: seller header + offer details + description */}
        <Card>
          <CardContent className="space-y-6">
            {/* Seller header — cohesive row */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={SELLER.avatar} />
                  <AvatarFallback>{SELLER.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <Text variant="h4" className="truncate">{SELLER.name}</Text>
                  <Text variant="small" className="font-mono text-muted-foreground">
                    {formatAddress(SELLER.address)}
                  </Text>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <span className="text-primary">★</span>
                  <span className="font-medium">{SELLER.rating}</span>
                </div>
                <span className="text-muted-foreground">·</span>
                <span><span className="font-medium">{SELLER.totalTrades.toLocaleString()}</span> <span className="text-muted-foreground">trades</span></span>
                <span className="text-muted-foreground">·</span>
                <span><span className="font-medium">{SELLER.completionRate}</span> <span className="text-muted-foreground">completion</span></span>
              </div>
            </div>

            <Separator />

            {/* Offer details — tight 2-col grid, label + value side by side */}
            <div className="space-y-3">
              <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground">
                Offer Details
              </Text>
              <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm justify-start">
                <span className="text-muted-foreground">Price per {OFFER.cryptoToken}</span>
                <span className="font-mono">€{OFFER.pricePerUnit.toLocaleString()}</span>
                <span className="text-muted-foreground">Trade range</span>
                <span className="font-mono">€{OFFER.minAmount} – €{OFFER.maxAmount}</span>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Globe className="w-4 h-4" /> Network
                </span>
                <span>{OFFER.network}</span>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Expires
                </span>
                <span>{OFFER.expiresAt}</span>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Platform fee
                </span>
                <span className="font-mono">{feePercent}% (+{OFFER.networkFee} gas)</span>
                <span className="text-muted-foreground">Payment methods</span>
                <span className="flex flex-wrap gap-1.5">
                  {OFFER.paymentMethods.map((m) => (
                    <Badge key={m} variant="secondary" className="rounded-full">{m}</Badge>
                  ))}
                </span>
                <span className="text-muted-foreground">Regions</span>
                <span className="flex flex-wrap gap-1.5">
                  {OFFER.availableRegions.map((r) => (
                    <Badge key={r} variant="outline" className="rounded-full">{r}</Badge>
                  ))}
                </span>
                {OFFER.tags.length > 0 && (
                  <>
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Tag className="w-4 h-4" /> Tags
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {OFFER.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="rounded-full">{t}</Badge>
                      ))}
                    </span>
                  </>
                )}
              </div>
            </div>

            <Separator />

            {/* From the seller — constrained to ~65% width */}
            <div className="max-w-[65%]">
              <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                Description
              </Text>
              <Text variant="body" className="text-muted-foreground leading-relaxed">
                {OFFER.description}
              </Text>
            </div>
          </CardContent>
        </Card>

        {/* Trade input card */}
        <Card>
          <CardContent className="space-y-5">
            {/* Amount input + currency selector */}
            <div className="space-y-2">
              <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground">
                Amount
              </Text>
              <div className="flex gap-2">
                <Input type="text" inputMode="decimal" placeholder="0.00" className="rounded-full" />
                <Select defaultValue={OFFER.cryptoToken}>
                  <SelectTrigger className="w-28 rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OFFER.cryptoToken}>{OFFER.cryptoToken}</SelectItem>
                    <SelectItem value={OFFER.fiatCurrency}>{OFFER.fiatCurrency}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Payment method dropdown + action */}
            <div className="space-y-2">
              <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground">
                Payment method
              </Text>
              <div className="flex gap-2">
                <Select defaultValue={OFFER.paymentMethods[0]}>
                  <SelectTrigger className="w-full rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFER.paymentMethods.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button className="rounded-full shadow-none px-8">
                  Open Trade
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </section>
  )
}
