import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { AddressWithActions } from '@/components/custom/AddressWithActions'
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
  const { t } = useTranslation()
  const { data: offer, isLoading, isError } = useOffer(id)

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('openOffer.loadingOffer')}
      </section>
    )
  }

  if (isError || !offer) {
    return (
      <section>
        <AppPageHeader title={t('openOffer.offerNotFound')} variant="split" onBack={() => navigate(-1)} />
        <Card className="glass-panel rounded-2xl p-6">
          <CardContent>
            <Text variant="body" className="text-muted-foreground">
              {t('openOffer.offerNotFoundDescription')}
            </Text>
            <Button className="rounded-full mt-4" onClick={() => navigate('/app/offers')}>
              {t('openOffer.backToOffers')}
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
  const middleTruncate = (addr: string) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '')

  const regions = (offer.available_regions ?? [])
    .map((r: string) => REGION_NAMES[r] ?? r)
    .join(', ') || 'Global'

  const expiresAt = offer.expires_at ? new Date(offer.expires_at) : null

  return (
    <section>
      <AppPageHeader
        title={t('openOffer.viewOffer')}
        subtitle={t('openOffer.subtitle')}
        variant="split"
        onBack={() => navigate(-1)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Offer Details */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="glass-panel rounded-2xl p-6">
            <CardContent className="px-6 py-0">
              {/* Trader Info */}
              <div className="flex items-center gap-4 mb-3">
                <Link to={`/app/profile/${sellerAddr}`}>
                  <Avatar className="h-12 w-12 hover:opacity-80 transition-opacity">
                    <AvatarImage src={seller?.avatar_url ?? undefined} />
                    <AvatarFallback>{sellerName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {sellerAddr && sellerName === sellerAddr ? (
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Link to={`/app/profile/${sellerAddr}`}>
                          <Text variant="h4" className="truncate hover:underline">{middleTruncate(sellerAddr)}</Text>
                        </Link>
                        <AddressWithActions address={sellerAddr} explorerBase="https://blockscan.com/token/" showText={false} />
                      </div>
                    ) : (
                      <Link to={`/app/profile/${sellerAddr}`}>
                        <Text variant="h4" className="truncate hover:underline">{sellerName}</Text>
                      </Link>
                    )}
                    <Badge variant={seller?.verification_level === 'verified' || seller?.verification_level === 'trusted' ? 'default' : 'secondary'}>
                      {seller?.verification_level ?? t('openOffer.unverified')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <span className="text-yellow-500">★</span>
                      <span>{Number(seller?.avg_rating) || '—'}</span>
                    </div>
                     <div>{(seller?.total_trades ?? 0).toLocaleString()} {t('openOffer.trades')}</div>
                    {sellerAddr && (
                      <AddressWithActions address={sellerAddr} explorerBase="https://blockscan.com/token/" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expiry */}
              {expiresAt && (
                <Alert className="mb-3">
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    {t('openOffer.offerExpires', { date: expiresAt.toLocaleString() })}
                  </AlertDescription>
                </Alert>
              )}

              {/* Offer Details
                  Vertical label-on-top / value-below per the design system
                  (`mb-2` rhythm for label → content in form/detail cards).
                  `items-start` on the grid keeps each cell at its content
                  height instead of stretching to the row's tallest cell, so
                  the row gap stays consistent regardless of value size. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 items-start">
                <div className="space-y-1.5">
                   <Text variant="small" className="text-muted-foreground">{t('openOffer.type')}</Text>
                  <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={offer.type === 'buy' ? 'default' : 'secondary'} className="rounded-full">
                    {offer.type} {offer.crypto_token}
                  </Badge>
                  {offer.is_private && (
                    <Badge variant="outline" className="rounded-full">
                      {t('offers.private')}
                    </Badge>
                  )}
                  </div>
                </div>
                <div className="space-y-1.5">
                   <Text variant="small" className="text-muted-foreground">{t('openOffer.pricePerUnit', { token: offer.crypto_token })}</Text>
                  <Text variant="h3">{symbol}{price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </div>
                <div className="space-y-1.5">
                   <Text variant="small" className="text-muted-foreground">{t('openOffer.amountRange')}</Text>
                  <Text variant="body">{symbol}{minAmount.toLocaleString()} – {symbol}{maxAmount.toLocaleString()}</Text>
                </div>
                <div className="space-y-1.5">
                   <Text variant="small" className="text-muted-foreground">{t('openOffer.location')}</Text>
                  <Text variant="body">{regions}</Text>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="mt-4">
                 <Text variant="small" className="text-muted-foreground mb-1.5">{t('openOffer.paymentMethod')}</Text>
                <div className="flex items-center flex-wrap gap-2">
                  {(offer.payment_methods ?? []).map((m: string) => (
                    <Badge key={m} className="rounded-full">{m}</Badge>
                  ))}
                </div>
              </div>

              {/* Description */}
              {offer.description && (
                <div className="mt-4">
                   <Text variant="small" className="text-muted-foreground mb-1.5">{t('openOffer.description')}</Text>
                  <Text variant="body" className="leading-6 whitespace-pre-wrap">
                    {offer.description}
                  </Text>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Acceptance Terms */}
          <Card className="glass-panel rounded-2xl p-6">
            <CardContent className="px-6 py-0">
              <Text variant="h4" className="font-semibold mb-2">{t('openOffer.acceptanceTerms')}</Text>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>• {t('openOffer.termRange', { min: `${symbol}${minAmount.toLocaleString()}`, max: `${symbol}${maxAmount.toLocaleString()}` })}</li>
                <li>• {t('openOffer.termPayment')}</li>
                <li>• {t('openOffer.termVerify')}</li>
                <li>• {t('openOffer.termEscrow')}</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Actions Sidebar */}
        <div className="space-y-4">
          <Card className="glass-panel rounded-2xl p-6">
            <CardContent>
              <div className="space-y-3">
                <div className="text-center">
                  <Text variant="h4">{t('openOffer.readyToTrade')}</Text>
                  <Text variant="muted" className="text-sm mt-1">
                    {t('openOffer.readyToTradeSubtitle')}
                  </Text>
                </div>
                <Button
                  className="w-full rounded-full"
                  size="lg"
                  onClick={() => navigate(`/app/trade/${offer.id}`)}
                >
                  {t('openOffer.continueToTrade')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel rounded-2xl p-6">
            <CardContent>
              <Text variant="h4" className="font-semibold mb-2">{t('openOffer.securityNote')}</Text>
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                   <Text variant="small" className="font-semibold mb-1">{t('openOffer.escrowProtection')}</Text>
                   <p className="text-xs text-muted-foreground">
                     {t('openOffer.escrowProtectionDescription')}
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
