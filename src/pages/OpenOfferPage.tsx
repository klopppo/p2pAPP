import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Clock, Shield, Loader2 } from 'lucide-react'
import { useOffer } from '@/hooks/useOffers'

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
const currencySymbol = (code: string) => CURRENCY_SYMBOLS[code] ?? ''

const REGION_NAMES: Record<string, string> = {
  IT: 'Italy', DE: 'Germany', FR: 'France', ES: 'Spain',
}

export function OpenOfferPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: offer, isLoading, isError } = useOffer(id)

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading offer…
      </section>
    )
  }

  if (isError || !offer) {
    return (
      <section>
        <AppPageHeader title="Offer not found" variant="split" onBack={() => navigate(-1)} />
        <Card className="glass-panel rounded-2xl">
          <CardContent className="p-6">
            <Text variant="body" className="text-muted-foreground">
              This offer couldn’t be loaded. It may have been removed or expired.
            </Text>
            <Button className="rounded-full mt-4" onClick={() => navigate('/app/offers')}>
              Back to offers
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  const price = Number(offer.price_per_unit) || 0
  const minAmount = Number(offer.min_amount) || 0
  const maxAmount = Number(offer.max_amount) || 0
  const symbol = currencySymbol(offer.fiat_currency)
  const seller = offer.seller
  const sellerName = seller?.nickname ?? (seller?.wallet_address ?? 'Trader')
  const sellerAddr = seller?.wallet_address ?? ''
  const formatAddress = (addr: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ''
  const regions = (offer.available_regions ?? [])
    .map((r: string) => REGION_NAMES[r] ?? r)
    .join(', ') || 'Global'

  const expiresAt = offer.expires_at ? new Date(offer.expires_at) : null

  return (
    <section>
      <AppPageHeader
        title="View Offer"
        subtitle="Review the offer details and decide if you want to accept"
        variant="split"
        onBack={() => navigate(-1)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Offer Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-panel rounded-2xl">
            <CardContent className="p-6 md:p-8">
              {/* Trader Info */}
              <div className="flex items-center gap-4 mb-6">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={seller?.avatar_url ?? undefined} />
                  <AvatarFallback>{sellerName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Text variant="h4">{sellerName}</Text>
                    <Badge variant={seller?.verification_level === 'verified' || seller?.verification_level === 'trusted' ? 'default' : 'secondary'}>
                      {seller?.verification_level ?? 'unverified'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <span className="text-yellow-500">★</span>
                      <span>{Number(seller?.avg_rating) || '—'}</span>
                    </div>
                    <div>{(seller?.total_trades ?? 0).toLocaleString()} trades</div>
                    {sellerAddr && (
                      <div className="font-mono text-xs text-muted-foreground">{formatAddress(sellerAddr)}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Expiry */}
              {expiresAt && (
                <Alert className="mb-6">
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    Offer expires {expiresAt.toLocaleString()}
                  </AlertDescription>
                </Alert>
              )}

              {/* Offer Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Text variant="small" className="text-muted-foreground">Type</Text>
                  <Badge variant={offer.type === 'buy' ? 'default' : 'secondary'} className="rounded-full">
                    {offer.type} {offer.crypto_token}
                  </Badge>
                </div>
                <div className="space-y-3">
                  <Text variant="small" className="text-muted-foreground">Price per {offer.crypto_token}</Text>
                  <Text variant="h3">{symbol}{price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </div>
                <div className="space-y-3">
                  <Text variant="small" className="text-muted-foreground">Amount Range</Text>
                  <Text variant="body">{symbol}{minAmount.toLocaleString()} – {symbol}{maxAmount.toLocaleString()}</Text>
                </div>
                <div className="space-y-3">
                  <Text variant="small" className="text-muted-foreground">Location</Text>
                  <Text variant="body">{regions}</Text>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="mt-6">
                <Text variant="small" className="text-muted-foreground mb-2">Payment Method</Text>
                <div className="flex items-center flex-wrap gap-2">
                  {(offer.payment_methods ?? []).map((m: string) => (
                    <Badge key={m} className="rounded-full">{m}</Badge>
                  ))}
                </div>
              </div>

              {/* Description */}
              {offer.description && (
                <div className="mt-6">
                  <Text variant="small" className="text-muted-foreground mb-2">Description</Text>
                  <Text variant="body" className="whitespace-pre-wrap">
                    {offer.description}
                  </Text>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Acceptance Terms */}
          <Card className="glass-panel rounded-2xl">
            <CardContent className="p-6 md:p-8">
              <Text variant="h4" className="font-semibold mb-4">Acceptance Terms</Text>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• The amount must be within the specified range ({symbol}{minAmount.toLocaleString()} – {symbol}{maxAmount.toLocaleString()})</li>
                <li>• The payment method must match one specified in the offer</li>
                <li>• You must verify the trader’s identity before making payment</li>
                <li>• Escrow will hold funds until the trade is confirmed as completed</li>
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
                  <Text variant="h4">Ready to Trade?</Text>
                  <Text variant="muted" className="text-sm mt-1">
                    Continue to set your amount and open the trade
                  </Text>
                </div>
                <Button
                  className="w-full rounded-full"
                  size="lg"
                  onClick={() => navigate(`/app/trade/${offer.id}`)}
                >
                  Continue to Trade
                </Button>
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
