import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { createOffer, upsertUser } from '@/lib/supabase'

interface OfferForm {
  type: 'buy' | 'sell'
  token: string
  price: number
  minAmount: number
  maxAmount: number
  paymentMethod: string
  location: string
  gracePeriod: number
  isPrivate: boolean
  targetUser: string
}

export function CreateOfferPage() {
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const [formData, setFormData] = useState<OfferForm>({
    type: 'buy',
    token: 'EUR',
    price: 52340,
    minAmount: 5000,
    maxAmount: 50000,
    paymentMethod: 'SEPA Instant',
    location: 'Italy',
    gracePeriod: 24,
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
      toast.error('Connect your wallet to create an offer.')
      return
    }

    setIsSubmitting(true)

    try {
      const me = await upsertUser(address)

      // Prepare offer data
      // NOTE: available_regions is CHAR(2)[] (ISO country codes), so map the
      // human-readable location. grace_period_hours has no DB column, so it is
      // intentionally not sent (the form field stays for future use).
      const offerData = {
        seller_id: me.id,
        type: formData.type,
        crypto_token: formData.token,
        crypto_amount: formData.maxAmount, // Using max amount for now
        fiat_currency: 'EUR',
        fiat_amount: formData.maxAmount * formData.price,
        price_per_unit: formData.price,
        min_amount: formData.minAmount,
        max_amount: formData.maxAmount,
        payment_methods: [formData.paymentMethod],
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

      toast.success('Offer created successfully!')
      navigate('/app/offers')
    } catch (error) {
      console.error('Error creating offer:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to create offer. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const tokens = ['EUR', 'USD', 'GBP', 'BTC', 'ETH', 'USDC', 'USDT']
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
          title="Create New Offer"
          subtitle="Browse and create trade offers"
          variant="centered"
          onBack={() => navigate(-1)}
        />

        {/* Centered Card */}
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Type Selection */}
                  <div>
                    <Label className="text-base font-semibold mb-4">Offer Type</Label>
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
                        Buy
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
                        Sell
                      </Button>
                    </div>
                  </div>

                  {/* Token and Price */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="token" className="text-base font-semibold mb-4">
                        Token/Currency
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
                      <Label htmlFor="price" className="text-base font-semibold mb-4">
                        Price Per Unit
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="minAmount" className="text-base font-semibold mb-4">
                        Minimum Amount
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
                      <Label htmlFor="maxAmount" className="text-base font-semibold mb-4">
                        Maximum Amount
                      </Label>
                      <Input
                        id="maxAmount"
                        type="number"
                        value={formData.maxAmount}
                        onChange={(e) => setFormData({ ...formData, maxAmount: Number(e.target.value) })}
                        className="rounded-full border border-border"
                        placeholder="50000"
                      />
                    </div>
                  </div>

                  {/* Payment and Location */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="paymentMethod" className="text-base font-semibold mb-4">
                        Payment Method
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
                      <Label htmlFor="location" className="text-base font-semibold mb-4">
                        Location
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
                    <Label htmlFor="gracePeriod" className="text-base font-semibold mb-4">
                      Grace Period (hours)
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
                      Time for the counterparty to accept the offer
                    </p>
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
                        Make Private Offer
                      </Label>
                    </div>
                    {formData.isPrivate && (
                      <div className="mt-4">
                        <Label htmlFor="targetUser" className="text-base font-semibold mb-4">
                          Target User Address
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
                          Creating...
                        </>
                      ) : (
                        'Create Offer'
                      )}
                    </Button>
                  </div>
                </form>
        </Card>
      </div>
  )
}