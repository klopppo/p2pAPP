import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
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
import { createOffer, ensureUser } from '@/lib/supabase'

// Standard unit-of-measure decimals per asset. offers.crypto_amount /
// min/max_amount are NUMERIC(30,18) but stored in the asset's natural human
// units (e.g. 0.5 ETH), so derived crypto quantities are rounded to the
// token's standard precision before persisting / previewing.
const TOKEN_DECIMALS: Record<string, number> = {
  BTC: 8,
  ETH: 18,
  USDC: 6,
  USDT: 6,
  DAI: 18,
  EUR: 2,
  USD: 2,
  GBP: 2,
}
const tokenDecimals = (token: string) => TOKEN_DECIMALS[token] ?? 8
const roundTo = (value: number, decimals: number) => Number(value.toFixed(decimals))
const roundFiat = (value: number) => roundTo(value, 2)
const formatTokenAmount = (value: number, token: string) =>
  value.toLocaleString('en-US', {
    maximumFractionDigits: Math.min(tokenDecimals(token), 12),
  })

interface OfferForm {
  type: 'buy' | 'sell'
  token: string
  price: number
  minAmount: number
  maxAmount: number
  paymentMethod: string
  location: string
  gracePeriod: number
  description: string
  isPrivate: boolean
  targetUser: string
}

export function CreateOfferPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const [formData, setFormData] = useState<OfferForm>({
    type: 'buy',
    token: 'BTC',
    price: 52340,
    minAmount: 5000,
    maxAmount: 50000,
    paymentMethod: 'SEPA Instant',
    location: 'Italy',
    gracePeriod: 24,
    description: '',
    isPrivate: false,
    targetUser: ''
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // This app is wallet-based (no Supabase Auth session for wallet users),
    // so we resolve the seller from the connected wallet: upsert (idempotent
    // sync, also covers the connect-time sync) returns the user row with id.
    if (!isConnected || !address) {
      toast.error(t('createOffer.errorConnectWallet'))
      return
    }

    // Form validation
    if (formData.price <= 0) {
      toast.error(t('createOffer.errorPriceZero'))
      return
    }
    if (formData.minAmount <= 0) {
      toast.error(t('createOffer.errorMinAmountZero'))
      return
    }
    if (formData.maxAmount < formData.minAmount) {
      toast.error(t('createOffer.errorMaxLessThanMin'))
      return
    }
    if (
      formData.isPrivate &&
      !/^0x[a-fA-F0-9]{40}$/.test(formData.targetUser.trim())
    ) {
      toast.error(t('createOffer.errorTargetUserInvalid'))
      return
    }
    if (
      formData.isPrivate &&
      address &&
      formData.targetUser.trim().toLowerCase() === address.toLowerCase()
    ) {
      toast.error(t('createOffer.errorTargetUserSelf'))
      return
    }

    setIsSubmitting(true)

    try {
      const me = await ensureUser(address)
      if (!me) {
        // No SIWE session for this wallet yet — write flow can't proceed.
        toast.error(t('createOffer.errorConnectWallet'))
        setIsSubmitting(false)
        return
      }

      // Prepare offer data
      // NOTE: available_regions is CHAR(2)[] (ISO country codes), so map the
      // human-readable location. grace_period_hours has no DB column, so it is
      // intentionally not sent (the form field stays for future use).
      //
      // Units: min/max are entered in fiat (EUR). The crypto quantity is
      // derived from the price per unit — same inverse relationship the trade
      // flow uses (crypto_amount = fiat_amount / price_per_unit) — and rounded
      // to the asset's standard decimals.
      const cryptoAmount = roundTo(
        formData.maxAmount / formData.price,
        tokenDecimals(formData.token),
      )
      const offerData = {
        seller_id: me.id,
        type: formData.type,
        crypto_token: formData.token,
        crypto_amount: cryptoAmount,
        fiat_currency: 'EUR',
        fiat_amount: roundFiat(formData.maxAmount),
        price_per_unit: formData.price,
        min_amount: roundFiat(formData.minAmount),
        max_amount: roundFiat(formData.maxAmount),
        is_private: formData.isPrivate,
        target_user: formData.isPrivate
          ? formData.targetUser.trim().toLowerCase()
          : null,
        payment_methods: [formData.paymentMethod],
        description: formData.description.trim() || null,
        available_regions:
          formData.location === 'Global' ? [] : [REGION_CODES[formData.location] ?? formData.location.slice(0, 2).toUpperCase()],
        platform_fee_bps: 50, // 0.5%
        network_fee: 0,
        tags: [formData.location],
        featured: false,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 7 days
      }

      // Create offer in database
      await createOffer(offerData)

      toast.success(t('createOffer.successCreated'))
      navigate('/app/offers')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('createOffer.errorGeneric')
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const tokens = ['BTC', 'ETH', 'USDC', 'USDT', 'DAI', 'EUR', 'USD', 'GBP']
  const paymentMethods = [
    'SEPA Instant',
    'Bank Transfer',
    'PayPal',
    'PayPal Friends & Family',
    'Wise Transfer',
    'Wise',
    'Cash'
  ]
  const locations = ['Italy', 'Germany', 'France', 'Spain', 'Global']
  // offers.available_regions is CHAR(2)[] (ISO 3166-1 alpha-2 country codes).
  const REGION_CODES: Record<string, string> = {
    Italy: 'IT',
    Germany: 'DE',
    France: 'FR',
    Spain: 'ES',
  }

  return (
      <div className="w-full max-w-xl mx-auto">
        {/* Centered Header Block */}
        <AppPageHeader
          title={t('createOffer.title')}
          subtitle={t('createOffer.subtitle')}
          variant="centered"
          onBack={() => navigate(-1)}
        />

        {/* Centered Card */}
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Type Selection */}
                  <div>
                    <Label className="text-base font-semibold mb-2 block">{t('createOffer.offerType')}</Label>
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
                        {t('createOffer.buy')}
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
                        {t('createOffer.sell')}
                      </Button>
                    </div>
                  </div>

                  {/* Token and Price */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="token" className="text-base font-semibold mb-2 block">
                        {t('createOffer.tokenCurrency')}
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
                      <Label htmlFor="price" className="text-base font-semibold mb-2 block">
                        {t('createOffer.pricePerUnit')}
                      </Label>
                      <Input
                        id="price"
                        type="number"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                        className="rounded-full border border-border"
                        placeholder="52340"
                      />
                    </div>
                  </div>

                  {/* Amount Range */}
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t('createOffer.amountInFiat', { currency: 'EUR' })}
                    </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="minAmount" className="text-base font-semibold mb-2 block">
                        {t('createOffer.minimumAmount')}
                      </Label>
                      <Input
                        id="minAmount"
                        type="number"
                        value={formData.minAmount}
                        onChange={(e) => setFormData({ ...formData, minAmount: Number(e.target.value) })}
                        className="rounded-full border border-border"
                        placeholder="5000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="maxAmount" className="text-base font-semibold mb-2 block">
                        {t('createOffer.maximumAmount')}
                      </Label>
                      <Input
                        id="maxAmount"
                        type="number"
                        value={formData.maxAmount}
                        onChange={(e) => setFormData({ ...formData, maxAmount: Number(e.target.value) })}
                        className="rounded-full border border-border"
                        placeholder="50000"
                      />
                      {formData.price > 0 && formData.maxAmount > 0 && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {t('createOffer.cryptoEstimate', {
                            amount: formatTokenAmount(formData.maxAmount / formData.price, formData.token),
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
                        {t('createOffer.paymentMethod')}
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
                        {t('createOffer.location')}
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
                      {t('createOffer.gracePeriod')}
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
                      {t('createOffer.gracePeriodHint')}
                    </p>
                  </div>

                  {/* Description */}
                  <div>
                    <Label htmlFor="description" className="text-base font-semibold mb-2 block">
                      {t('createOffer.description')}
                    </Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      {t('createOffer.descriptionHint')}
                    </p>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="border border-border min-h-[120px] resize-none rounded-xl"
                      placeholder={t('createOffer.descriptionPlaceholder')}
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
                        {t('createOffer.makePrivateOffer')}
                      </Label>
                    </div>
                    {formData.isPrivate && (
                      <div className="mt-4">
                        <Label htmlFor="targetUser" className="text-base font-semibold mb-2 block">
                          {t('createOffer.targetUserAddress')}
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
                      disabled={isSubmitting}
                      className="rounded-full px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t('createOffer.creating')}
                        </>
                      ) : (
                        t('createOffer.createOffer')
                      )}
                    </Button>
                  </div>
                </form>
        </Card>
      </div>
  )
}