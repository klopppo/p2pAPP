import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Clock, Shield, AlertTriangle } from 'lucide-react'

interface OpenOffer {
  id: number
  type: 'buy' | 'sell'
  token: string
  price: number
  priceDisplay: string
  minAmount: number
  maxAmount: number
  paymentMethod: string
  location: string
  gracePeriod: number
  isPrivate: boolean
  targetUser?: string
  trader: {
    id: string
    name: string
    avatar: string
    rating: number
    trades: number
    online: boolean
  }
  createdAt: Date
}

export function OpenOfferPage() {
  const [timeLeft] = useState(3 * 60 * 60) // 3 hours in seconds
  const [offer] = useState<OpenOffer>({
    id: 1,
    type: 'buy',
    token: 'EUR',
    price: 52340,
    priceDisplay: '€52,340.00',
    minAmount: 5000,
    maxAmount: 50000,
    paymentMethod: 'SEPA Instant',
    location: 'Italy',
    gracePeriod: 24,
    isPrivate: false,
    trader: {
      id: '1',
      name: 'CryptoKing',
      avatar: 'https://images.unsplash.com/photo-1472099645745-095597429a3b?auto=format&fit=crop&q=80&w=100&h=100',
      rating: 4.96,
      trades: 29006,
      online: true
    },
    createdAt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
  })

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  return (
    <section>
            <AppPageHeader
              title="View Offer"
              subtitle="Review the offer details and decide if you want to accept"
              variant="split"
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Offer Details */}
              <div className="lg:col-span-2 space-y-6">
                <Card className="glass-panel rounded-2xl">
                  <CardContent className="p-6 md:p-8">
                    {/* Trader Info */}
                    <div className="flex items-center gap-4 mb-6">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={offer.trader.avatar} />
                        <AvatarFallback>{offer.trader.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Text variant="h4">{offer.trader.name}</Text>
                          <Badge variant={offer.trader.online ? 'default' : 'secondary'}>
                            {offer.trader.online ? 'Online' : 'Offline'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <span className="text-yellow-500">★</span>
                            <span>{offer.trader.rating}</span>
                          </div>
                          <div>{offer.trader.trades.toLocaleString()} trades</div>
                        </div>
                      </div>
                    </div>

                    {/* Grace Period Alert */}
                    <Alert className="mb-6">
                      <Clock className="h-4 w-4" />
                      <AlertDescription>
                        <div className="flex items-center justify-between">
                          <span>Offer expires in {formatTime(timeLeft)}</span>
                          <span className="text-xs text-muted-foreground">
                            Created {Math.round((Date.now() - offer.createdAt.getTime()) / 60000)} minutes ago
                          </span>
                        </div>
                      </AlertDescription>
                    </Alert>

                    {/* Offer Details */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <Text variant="small" className="text-muted-foreground">Type</Text>
                        <Badge variant={offer.type === 'buy' ? 'default' : 'secondary'} className="rounded-full">
                          {offer.type} {offer.token}
                        </Badge>
                      </div>
                      <div className="space-y-3">
                        <Text variant="small" className="text-muted-foreground">Price</Text>
                        <Text variant="h3">{offer.priceDisplay}</Text>
                      </div>
                      <div className="space-y-3">
                        <Text variant="small" className="text-muted-foreground">Amount Range</Text>
                        <Text variant="body">€{offer.minAmount.toLocaleString()} - €{offer.maxAmount.toLocaleString()}</Text>
                      </div>
                      <div className="space-y-3">
                        <Text variant="small" className="text-muted-foreground">Location</Text>
                        <Text variant="body">{offer.location}</Text>
                      </div>
                    </div>

                    {/* Payment Method */}
                    <div className="mt-6">
                      <Text variant="small" className="text-muted-foreground mb-2">Payment Method</Text>
                      <div className="flex items-center gap-2">
                        <Badge className="rounded-full">{offer.paymentMethod}</Badge>
                      </div>
                    </div>

                    {/* Private Offer Warning */}
                    {offer.isPrivate && (
                      <Alert className="mt-6 border-orange-200 bg-orange-50">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        <AlertDescription>
                          <div className="text-orange-800">
                            <Text variant="small" className="font-semibold mb-1">Private Offer</Text>
                            <p className="text-sm">This offer is intended for a specific user only.</p>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>

                {/* Acceptance Terms */}
                <Card className="glass-panel rounded-2xl">
                  <CardContent className="p-6 md:p-8">
                    <Text variant="h4" className="font-semibold mb-4">Acceptance Terms</Text>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>• You must complete the trade within the grace period</li>
                      <li>• The payment method must match what was specified in the offer</li>
                      <li>• The amount must be within the specified range</li>
                      <li>• You must verify the trader's identity before making payment</li>
                      <li>• Escrow will hold your funds until the trade is confirmed as completed</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Actions Sidebar */}
              <div className="space-y-6">
                <Card className="glass-panel rounded-2xl">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="text-center">
                        <Text variant="h4">Ready to Accept?</Text>
                        <Text variant="muted" className="text-sm mt-1">
                          By accepting, you agree to trade terms
                        </Text>
                      </div>
                      <Link to="/app/create-offer">
                        <Button className="w-full rounded-full" size="lg">
                          Create Offer
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-panel rounded-2xl">
                  <CardContent className="p-6">
                    <Text variant="h4" className="font-semibold mb-4">Security Note</Text>
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-green-500 mt-0.5" />
                      <div>
                        <Text variant="small" className="font-semibold mb-1">Escrow Protection</Text>
                        <p className="text-xs text-muted-foreground">
                          All trades are protected by our escrow system. Funds are only released after both parties confirm the trade.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
  )
}