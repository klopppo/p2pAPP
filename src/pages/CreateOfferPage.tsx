import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { createOffer, ensureUser, ensureWalletSession } from '@/lib/supabase'
import { signWalletMessage } from '@/lib/walletSigner'
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
  const { address, isConnected, status } = useAccount()
  const qc = useQueryClient()
  const [formData, setFormData] = useState<OfferForm>({
    type: 'buy',
    token: 'fUSD',
    fiatCurrency: 'USD',
    price: 1,
    minAmount: 100,
    maxAmount: 5000,
    paymentMethod: 'Bank Transfer',
    location: 'Global',
    gracePeriod: 24,
    description: '',
    isPrivate: false,
    targetUser: ''
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

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
      // 1) `ensureUser` requires a Supabase session (SIWE). If the wallet is
      //    connected but the user declined / missed the SIWE popup on connect,
      //    `useSyncUser` never wrote the session, so `ensureUser` returns
      //    null. Run SIWE inline + retry before bailing. The earlier toast
      //    (`errorConnectWallet`) was misleading: the wallet IS connected,
      //    the user just hasn't signed the SIWE challenge yet.
      let me = await ensureUser(address)
      if (!me && isConnected && address) {
        toast.loading(t('createOffer.signingIn', { defaultValue: 'Sign in with your wallet…' }), {
          id: 'siwe-inline',
        })
        const session = await ensureWalletSession(address, { signMessage: signWalletMessage })
        toast.dismiss('siwe-inline')
        if (session.user) {
          me = session.user
        } else {
          toast.error(t('createOffer.errorSiweRequired', {
            defaultValue: 'Sign-in with your wallet is required to create an offer.',
          }))
          setIsSubmitting(false)
          return
        }
      }
      if (!me) {
        toast.error(t('createOffer.errorConnectWallet'))
        setIsSubmitting(false)
        return
      }

      const cryptoAmount = roundTo(
        formData.maxAmount / formData.price,
        tokenDecimals(formData.token),
      )
      const offerData = {
        seller_id: me.id,
        type: formData.type,
        crypto_token: formData.token,
        crypto_amount: cryptoAmount,
        fiat_currency: formData.fiatCurrency,
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
          formData.location === 'Global'
            ? []
            : [REGION_CODES[formData.location] ?? formData.location.slice(0, 2).toUpperCase()],
        platform_fee_bps: 50, // 0.5%
        network_fee: 0,
        tags: [formData.location],
        featured: false,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }

      // Create offer in database
      await createOffer(offerData)
      // Force the offers list to refetch on the next mount (cached data
      // is fresh for `staleTime` default of 5s — the user would otherwise
      // wait up to that long when they navigate back).
      qc.invalidateQueries({ queryKey: ['offers'] })

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
    'Brazil': 'BR',
    'Turkey': 'TR',
    'Argentina': 'AR',
    'India': 'IN',
    'Nigeria': 'NG',
    'Canada': 'CA',
    'Australia': 'AU',
    'Mexico': 'MX',
    'Colombia': 'CO',
    'Switzerland': 'CH',
    'Japan': 'JP',
    'Philippines': 'PH',
    'Vietnam': 'VN',
    'United Arab Emirates': 'AE',
    'Italy': 'IT',
    'Germany': 'DE',
    'France': 'FR',
    'Spain': 'ES',
  }

  const currSymbol = currencySymbol(formData.fiatCurrency)

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
          {/* wagmi v2: `status` is the source of truth — `isConnected` lags a
              render during rehydration after a refresh / wallet switch and
              can flash `false` even though the ConnectButton shows the
              account. The banner mirrors the actual `status` so the user
              isn't blindsided by the toast when they click submit. */}
          {status !== 'connected' && (
            <Alert className="mb-4 rounded-2xl border-primary/30 bg-primary/5">
              <WalletIcon className="w-4 h-4" />
              <AlertDescription>
                {t('createOffer.connectWalletBanner', {
                  defaultValue: 'Connect a wallet from the navbar to create an offer.',
                })}
              </AlertDescription>
            </Alert>
          )}
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

                  {/* Token, Fiat Currency and Price */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      <Label htmlFor="fiatCurrency" className="text-base font-semibold mb-2 block">
                        {t('createOffer.fiatCurrency')}
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
                        {t('createOffer.pricePerUnit')} ({currSymbol.trim() || formData.fiatCurrency})
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
                      {t('createOffer.amountInFiat', { currency: formData.fiatCurrency })}
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
                      disabled={isSubmitting || status !== 'connected'}
                      className="rounded-full px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t('createOffer.creating')}
                        </>
                      ) : status !== 'connected' ? (
                        t('createOffer.connectToSubmit', {
                          defaultValue: 'Connect wallet to create',
                        })
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