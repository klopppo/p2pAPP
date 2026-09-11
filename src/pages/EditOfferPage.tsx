import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Text } from '@/components/ui/text'
import { Wallet as WalletIcon } from 'lucide-react'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { updateOffer, ensureUser, ensureWalletSession } from '@/lib/supabase'
import { signWalletMessage } from '@/lib/walletSigner'
import { useOffer } from '@/hooks/useOffers'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { currencySymbol, CURRENCY_SYMBOLS } from '@/lib/utils'

// Standard unit-of-measure decimals per asset. offers.crypto_amount /
// min/max_amount are NUMERIC(30,18) but stored in the asset's natural human
// units (e.g. 0.5 ETH), so derived crypto quantities are rounded to the
// token's standard precision before persisting / previewing.
const TOKEN_DECIMALS: Record<string, number> = {
  // fUSD is the factory-deployed test token on Sepolia (see contracts/script/DeploySepolia.s.sol).
  // 18 decimals, ERC-20 with a public mint() — testnet only. Replace this entry with
  // mainnet tokens (USDC/USDT/DAI = 6, ETH/WBTC = 18/8) once a real factory is live.
  fUSD: 18,
  USDT: 6,
  USDC: 6,
  DAI: 18,
  ETH: 18,
  WBTC: 8,
  BTC: 8,
}
const tokenDecimals = (token: string) => TOKEN_DECIMALS[token] ?? 18
const roundTo = (value: number, decimals: number) => Number(value.toFixed(decimals))
const roundFiat = (value: number) => roundTo(value, 2)
const formatTokenAmount = (value: number, token: string) =>
  value.toLocaleString('en-US', {
    maximumFractionDigits: Math.min(tokenDecimals(token), 12),
  })

interface OfferForm {
  type: 'buy' | 'sell'
  token: string
  fiatCurrency: string
  // Strings so the controlled inputs can be cleared while editing; parsed with
  // Number() at validation/submit time (see CreateOfferPage for the rationale).
  price: string
  minAmount: string
  maxAmount: string
  paymentMethod: string
  location: string
  gracePeriod: string
  description: string
  isPrivate: boolean
  targetUser: string
}

export function EditOfferPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const { status } = useAccount()
  const { data: user } = useCurrentUser()
  const qc = useQueryClient()
  const { data: offer, isLoading: offerLoading, isError: offerError } = useOffer(id)
  const [formData, setFormData] = useState<OfferForm | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Map the loaded offer row into the form shape. Fires once per offer load.
  // Keeps the rest of the form code identical to CreateOfferPage.
  useEffect(() => {
    if (!offer || hydrated) return
    // Reverse the region code → human label map so the dropdown opens with
    // the same label the seller picked at create time. Empty array means
    // "Global" (the default in the picker).
    const REGION_LABELS: Record<string, string> = {
      US: 'United States',
      EU: 'European Union',
      GB: 'United Kingdom',
      BR: 'Brazil',
      TR: 'Turkey',
      AR: 'Argentina',
      IN: 'India',
      NG: 'Nigeria',
      CA: 'Canada',
      AU: 'Australia',
      MX: 'Mexico',
      CO: 'Colombia',
      CH: 'Switzerland',
      JP: 'Japan',
      PH: 'Philippines',
      VN: 'Vietnam',
      AE: 'United Arab Emirates',
      IT: 'Italy',
      DE: 'Germany',
      FR: 'France',
      ES: 'Spain',
    }
    const code = offer.available_regions?.[0]
    const locationLabel = code ? (REGION_LABELS[code] ?? 'Global') : 'Global'

    // Hydrate the form once from the loaded offer. This is the canonical
    // "seed editable state from async data" pattern; the React Compiler lint
    // flags the synchronous setState, but deriving the form during render is
    // not viable here (the user then owns the fields).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormData({
      type: offer.type,
      token: offer.crypto_token,
      fiatCurrency: offer.fiat_currency,
      price: offer.price_per_unit != null ? String(offer.price_per_unit) : '',
      minAmount: offer.min_amount != null ? String(offer.min_amount) : '',
      maxAmount: offer.max_amount != null ? String(offer.max_amount) : '',
      paymentMethod: offer.payment_methods?.[0] ?? 'Bank Transfer',
      location: locationLabel,
      gracePeriod: Number(offer.grace_period) || 24,
      description: offer.description ?? '',
      isPrivate: offer.is_private,
      targetUser: offer.target_user ?? '',
    })
    setHydrated(true)
  }, [offer, hydrated])

  // Ownership check: only the seller may edit. The `useOffer` query returns
  // `seller.id` from the join; if it doesn't match the connected wallet's
  // `users.id`, kick back to the offer page with an error.
  const isOwner = useMemo(() => {
    if (!user || !offer) return false
    return user.id === offer.seller_id || user.id === offer.seller?.id
  }, [user, offer])

  // Loading only while the offer fetch is in flight, or while a successfully
  // fetched offer is being mapped into the form (one render). The old
  // `|| !hydrated` guard never released when the query errored/returned null
  // (the hydration effect bails at `!offer`), so a bad offer id spun forever
  // and the not-found branch below was unreachable.
  if (offerLoading || (!!offer && !hydrated)) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('editOffer.loading')}
      </section>
    )
  }

  if (offerError || !offer || !formData) {
    return (
      <section>
        <AppPageHeader title={t('editOffer.offerNotFound')} variant="split" onBack={() => navigate(-1)} />
        <Card className="glass-panel rounded-2xl p-6">
          <CardContent>
            <Text className="text-muted-foreground">{t('editOffer.offerNotFoundDescription')}</Text>
            <Button className="rounded-full mt-4" onClick={() => navigate('/app/offers')}>
              {t('editOffer.backToOffers')}
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  if (!isOwner) {
    return (
      <section>
        <AppPageHeader title={t('editOffer.notOwner')} variant="split" onBack={() => navigate(-1)} />
        <Card className="glass-panel rounded-2xl p-6">
          <CardContent>
            <Text className="text-muted-foreground">{t('editOffer.notOwnerDescription')}</Text>
            <Button className="rounded-full mt-4" onClick={() => navigate(`/app/offer/${offer.id}`)}>
              {t('editOffer.backToOffer')}
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!user || status !== 'connected') {
      toast.error(t('editOffer.errorConnectWallet'))
      return
    }

    if (!(Number(formData.price) > 0)) {
      toast.error(t('editOffer.errorPriceZero'))
      return
    }
    if (!(Number(formData.minAmount) > 0)) {
      toast.error(t('editOffer.errorMinAmountZero'))
      return
    }
    if (!(Number(formData.maxAmount) >= Number(formData.minAmount))) {
      toast.error(t('editOffer.errorMaxLessThanMin'))
      return
    }
    if (!Number.isFinite(formData.gracePeriod) || formData.gracePeriod <= 0) {
      toast.error(t('editOffer.errorGracePeriodInvalid'))
      return
    }
    if (formData.gracePeriod > 8760) {
      toast.error(t('editOffer.errorGracePeriodTooLong'))
      return
    }
    if (
      formData.isPrivate &&
      !/^0x[a-fA-F0-9]{40}$/.test(formData.targetUser.trim())
    ) {
      toast.error(t('editOffer.errorTargetUserInvalid'))
      return
    }
    if (
      formData.isPrivate &&
      formData.targetUser.trim().toLowerCase() === user.wallet_address.toLowerCase()
    ) {
      toast.error(t('editOffer.errorTargetUserSelf'))
      return
    }

    setIsSubmitting(true)

    try {
      // Same SIWE-on-demand pattern as CreateOfferPage. `updateOffer` is
      // an upsert via the public Supabase client; RLS is permissive in dev
      // but we still gate on the connected wallet.
      let me = await ensureUser(user.wallet_address)
      if (!me && user.wallet_address) {
        toast.loading(t('editOffer.signingIn'), { id: 'siwe-inline' })
        const session = await ensureWalletSession(user.wallet_address, {
          signMessage: signWalletMessage,
        })
        toast.dismiss('siwe-inline')
        me = session.user
      }
      if (!me) {
        toast.error(t('editOffer.errorSiweRequired'))
        setIsSubmitting(false)
        return
      }
      if (me.id !== offer.seller_id && me.id !== offer.seller?.id) {
        toast.error(t('editOffer.errorNotOwner'))
        setIsSubmitting(false)
        return
      }

      const cryptoAmount = roundTo(
        Number(formData.maxAmount) / Number(formData.price),
        tokenDecimals(formData.token),
      )

      const patch = {
        type: formData.type,
        crypto_token: formData.token,
        crypto_amount: cryptoAmount,
        fiat_currency: formData.fiatCurrency,
        fiat_amount: roundFiat(Number(formData.maxAmount)),
        price_per_unit: Number(formData.price),
        min_amount: roundFiat(Number(formData.minAmount)),
        max_amount: roundFiat(Number(formData.maxAmount)),
        is_private: formData.isPrivate,
        target_user: formData.isPrivate
          ? formData.targetUser.trim().toLowerCase()
          : null,
        payment_methods: [formData.paymentMethod],
        description: formData.description.trim() || null,
        grace_period: Math.round(formData.gracePeriod),
        available_regions:
          formData.location === 'Global'
            ? []
            : [REGION_CODES[formData.location] ?? formData.location.slice(0, 2).toUpperCase()],
        tags: [formData.location],
      }

      await updateOffer(offer.id, patch)
      // Refresh every offers query so the changes appear everywhere.
      qc.invalidateQueries({ queryKey: ['offers'] })
      qc.invalidateQueries({ queryKey: ['offer', offer.id] })

      toast.success(t('editOffer.successUpdated'))
      navigate(`/app/offer/${offer.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('editOffer.errorGeneric'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const tokens = ['fUSD', 'USDT', 'USDC', 'DAI', 'ETH', 'WBTC', 'BTC']
  const fiatCurrencies = Object.keys(CURRENCY_SYMBOLS)
  const paymentMethods = [
    'Bank Transfer',
    'SEPA Instant',
    'Pix',
    'Revolut',
    'Wise',
    'Zelle',
    'Venmo',
    'CashApp',
    'PayPal',
    'UPI / IMPS',
    'Alipay',
    'WeChat Pay',
    'M-Pesa',
    'Papara',
    'Mercado Pago',
    'Interac e-Transfer',
    'Cash in Person',
  ]
  const locations = [
    'Global',
    'United States',
    'European Union',
    'United Kingdom',
    'Brazil',
    'Turkey',
    'Argentina',
    'India',
    'Nigeria',
    'Canada',
    'Australia',
    'Mexico',
    'Colombia',
    'Switzerland',
    'Japan',
    'Philippines',
    'Vietnam',
    'United Arab Emirates',
    'Italy',
    'Germany',
    'France',
    'Spain',
  ]
  const REGION_CODES: Record<string, string> = {
    'United States': 'US',
    'European Union': 'EU',
    'United Kingdom': 'GB',
    Brazil: 'BR',
    Turkey: 'TR',
    Argentina: 'AR',
    India: 'IN',
    Nigeria: 'NG',
    Canada: 'CA',
    Australia: 'AU',
    Mexico: 'MX',
    Colombia: 'CO',
    Switzerland: 'CH',
    Japan: 'JP',
    Philippines: 'PH',
    Vietnam: 'VN',
    'United Arab Emirates': 'AE',
    Italy: 'IT',
    Germany: 'DE',
    France: 'FR',
    Spain: 'ES',
  }

  const currSymbol = currencySymbol(formData.fiatCurrency)

  return (
    <div className="w-full max-w-xl mx-auto">
      <AppPageHeader
        title={t('editOffer.title')}
        subtitle={t('editOffer.subtitle', { offerId: offer.offer_id })}
        variant="centered"
        onBack={() => navigate(`/app/offer/${offer.id}`)}
      />

      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        {status !== 'connected' && (
          <Alert className="mb-4 rounded-2xl border-primary/30 bg-primary/5">
            <WalletIcon className="w-4 h-4" />
            <AlertDescription>
              {t('editOffer.connectWalletBanner')}
            </AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Type Selection */}
          <div>
            <Label className="text-base font-semibold mb-2 block">{t('editOffer.offerType')}</Label>
            <div className="flex justify-center gap-4">
              <Button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'buy' })}
                className={`w-40 justify-center rounded-full ${
                  formData.type === 'buy'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground hover:bg-muted/70'
                }`}
              >
                {t('editOffer.buy')}
              </Button>
              <Button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'sell' })}
                className={`w-40 justify-center rounded-full ${
                  formData.type === 'sell'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground hover:bg-muted/70'
                }`}
              >
                {t('editOffer.sell')}
              </Button>
            </div>
          </div>

          {/* Token, Fiat Currency and Price */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="token" className="text-base font-semibold mb-2 block">
                {t('editOffer.tokenCurrency')}
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between rounded-full border border-border"
                  >
                    {formData.token}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuGroup>
                    {tokens.map((token) => (
                      <DropdownMenuItem
                        key={token}
                        onSelect={() => setFormData({ ...formData, token })}
                      >
                        {token}
                        {formData.token === token && <Check className="w-4 h-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div>
              <Label htmlFor="fiatCurrency" className="text-base font-semibold mb-2 block">
                {t('editOffer.fiatCurrency')}
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between rounded-full border border-border"
                  >
                    {formData.fiatCurrency} ({currSymbol.trim() || formData.fiatCurrency})
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
                  <DropdownMenuGroup>
                    {fiatCurrencies.map((fiat) => (
                      <DropdownMenuItem
                        key={fiat}
                        onSelect={() => setFormData({ ...formData, fiatCurrency: fiat })}
                      >
                        {fiat} ({currencySymbol(fiat).trim() || fiat})
                        {formData.fiatCurrency === fiat && <Check className="w-4 h-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div>
              <Label htmlFor="price" className="text-base font-semibold mb-2 block">
                {t('editOffer.pricePerUnit')} ({currSymbol.trim() || formData.fiatCurrency})
              </Label>
              <Input
                id="price"
                type="number"
                inputMode="decimal"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="rounded-full border border-border"
                placeholder="52340"
              />
            </div>
          </div>

          {/* Amount Range */}
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('editOffer.amountInFiat', { currency: formData.fiatCurrency })}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="minAmount" className="text-base font-semibold mb-2 block">
                  {t('editOffer.minimumAmount')}
                </Label>
                <Input
                  id="minAmount"
                  type="number"
                  inputMode="decimal"
                  value={formData.minAmount}
                  onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                  className="rounded-full border border-border"
                  placeholder="5000"
                />
              </div>
              <div>
                <Label htmlFor="maxAmount" className="text-base font-semibold mb-2 block">
                  {t('editOffer.maximumAmount')}
                </Label>
                <Input
                  id="maxAmount"
                  type="number"
                  inputMode="decimal"
                  value={formData.maxAmount}
                  onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value })}
                  className="rounded-full border border-border"
                  placeholder="50000"
                />
                {Number(formData.price) > 0 && Number(formData.maxAmount) > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('editOffer.cryptoEstimate', {
                      amount: formatTokenAmount(Number(formData.maxAmount) / Number(formData.price), formData.token),
                      token: formData.token,
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Payment and Location */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="paymentMethod" className="text-base font-semibold mb-2 block">
                {t('editOffer.paymentMethod')}
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between rounded-full border border-border"
                  >
                    {formData.paymentMethod}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuGroup>
                    {paymentMethods.map((method) => (
                      <DropdownMenuItem
                        key={method}
                        onSelect={() => setFormData({ ...formData, paymentMethod: method })}
                      >
                        {method}
                        {formData.paymentMethod === method && <Check className="w-4 h-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div>
              <Label htmlFor="location" className="text-base font-semibold mb-2 block">
                {t('editOffer.location')}
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between rounded-full border border-border"
                  >
                    {formData.location}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuGroup>
                    {locations.map((location) => (
                      <DropdownMenuItem
                        key={location}
                        onSelect={() => setFormData({ ...formData, location })}
                      >
                        {location}
                        {formData.location === location && <Check className="w-4 h-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Grace Period */}
          <div>
            <Label htmlFor="gracePeriod" className="text-base font-semibold mb-2 block">
              {t('editOffer.gracePeriod')}
            </Label>
            <Input
              id="gracePeriod"
              type="number"
              value={formData.gracePeriod}
              onChange={(e) => setFormData({ ...formData, gracePeriod: Number(e.target.value) })}
              className="rounded-full border border-border"
              placeholder="24"
            />
            <p className="text-sm text-muted-foreground mt-2">
              {t('editOffer.gracePeriodHint')}
            </p>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description" className="text-base font-semibold mb-2 block">
              {t('editOffer.description')}
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              {t('editOffer.descriptionHint')}
            </p>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="border border-border min-h-[120px] resize-none rounded-xl"
              placeholder={t('editOffer.descriptionPlaceholder')}
              maxLength={1000}
            />
            <p className="text-sm text-muted-foreground mt-1">{formData.description.length}/1000</p>
          </div>

          {/* Private Offer */}
          <div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isPrivate"
                checked={formData.isPrivate}
                onChange={(e) => setFormData({ ...formData, isPrivate: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="isPrivate" className="text-base font-semibold">
                {t('editOffer.makePrivateOffer')}
              </Label>
            </div>
            {formData.isPrivate && (
              <div className="mt-4">
                <Label htmlFor="targetUser" className="text-base font-semibold mb-2 block">
                  {t('editOffer.targetUserAddress')}
                </Label>
                <Input
                  id="targetUser"
                  value={formData.targetUser}
                  onChange={(e) => setFormData({ ...formData, targetUser: e.target.value })}
                  className="rounded-full border border-border"
                  placeholder="0x1234567890abcdef..."
                />
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <Button
              type="submit"
              disabled={isSubmitting || status !== 'connected'}
              className="rounded-full px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('editOffer.saving')}
                </>
              ) : status !== 'connected' ? (
                t('editOffer.connectToSubmit')
              ) : (
                t('editOffer.saveChanges')
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
