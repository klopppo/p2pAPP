import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { FileEdit, DollarSign, CreditCard, Clock, AlertTriangle, CheckCircle } from 'lucide-react'

export default function CreatingOffers() {
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <Text variant="h3" className="font-bold">
          Creating Offers
        </Text>
        <p className="text-muted-foreground max-w-2xl">
          Learn how to list buy and sell offers on the CofferNode marketplace.
          Well-crafted offers attract more traders and complete faster.
        </p>
      </div>

      {/* How to create */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <FileEdit className="w-5 h-5" />
            </div>
            <Text variant="h4" className="font-semibold">Creating Your First Offer</Text>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Navigate to the <strong className="text-foreground">Create Offer</strong> page from the
              navigation bar. You'll need to specify the following parameters:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/50 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-foreground font-medium text-xs">Asset & Amount</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Choose the crypto asset (ETH, USDC, BTC, etc.) and the amount you want to trade.
              </p>
            </div>
            <div className="rounded-xl border border-border/50 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <CreditCard className="w-3.5 h-3.5 text-green-400" />
                <span className="text-foreground font-medium text-xs">Payment Method</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Select how you want to receive or send payment: bank transfer, SEPA, PayPal, cash, etc.
              </p>
            </div>
            <div className="rounded-xl border border-border/50 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-foreground font-medium text-xs">Price</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Set your price relative to market rate. You can price at a premium or discount.
              </p>
            </div>
            <div className="rounded-xl border border-border/50 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-foreground font-medium text-xs">Expiry</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Set how long your offer stays active. After expiry, it's automatically delisted.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Separator />

      {/* Best practices */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <Text variant="h4" className="font-semibold">Best Practices</Text>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Be competitive on price</p>
                <p className="text-xs text-muted-foreground">
                  Offers priced closer to market rate get filled faster. Check the current
                  rate before listing.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Complete your profile</p>
                <p className="text-xs text-muted-foreground">
                  Traders are more likely to accept offers from users with verified profiles
                  and trade history.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Respond quickly</p>
                <p className="text-xs text-muted-foreground">
                  Fast response times build reputation. Enable notifications so you never
                  miss a trade initiation.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Never release before confirmation</p>
                <p className="text-xs text-muted-foreground">
                  Only confirm receipt of payment when you're certain the funds have settled
                  in your account. Crypto transactions are irreversible.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Offer lifecycle */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <Text variant="h4" className="font-semibold">Offer Lifecycle</Text>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <Badge variant="default" className="rounded-full w-20 justify-center">Active</Badge>
              <span>Your offer is visible in the marketplace and can be accepted.</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="rounded-full w-20 justify-center">Matched</Badge>
              <span>A trader has initiated a trade. Escrow is deploying.</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="rounded-full w-20 justify-center">In Trade</Badge>
              <span>Escrow is active. Payment negotiation in progress.</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="default" className="rounded-full w-20 justify-center bg-green-500">Completed</Badge>
              <span>Trade successfully completed. Funds released.</span>
            </div>
          </div>
        </div>
      </Card>
    </section>
  )
}
