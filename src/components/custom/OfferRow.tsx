import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ShieldCheck, Verified, Bolt } from 'lucide-react'

interface OfferRowProps {
  trader: string
  traderName: string
  rating: string
  trades: number
  paymentMethod: string
  paymentMethodIcon: string
  location: string
  isInstant?: boolean
  isKYCVerified?: boolean
  price: string
  currency: string
  priceChange?: string
  belowMarket?: string
  limits: string
  limitLabel?: string
  volumeType?: string
  isPositive: boolean
  sparkline: number[]
  onTrade: () => void
}

export function OfferRow({
  trader,
  traderName,
  rating,
  trades,
  paymentMethod,
  paymentMethodIcon: PaymentIcon,
  location,
  isInstant,
  isKYCVerified,
  price,
  currency,
  belowMarket,
  limits,
  limitLabel,
  isPositive,
  onTrade,
}: OfferRowProps) {
  return (
    <div className="glass-panel rounded-2xl p-6 offer-row transition-all group hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Trader Column */}
        <div className="md:col-span-3 flex items-center gap-4">
          <div className="relative">
            <Avatar className="w-12 h-12 border-2 border-primary overflow-hidden">
              <AvatarFallback>
                {trader.slice(2, 4).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-deep ${
              isPositive ? 'bg-success' : 'border-outline'
            }`} />
          </div>
          <div>
            <div className="font-bold flex items-center gap-2">
              {traderName}
              {isPositive && <Verified className="w-4 h-4 text-tertiary" />}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-primary">{rating}</span>
              <span className="opacity-50">• {trades.toLocaleString()} trades</span>
            </div>
          </div>
        </div>

        {/* Payment & Region Column */}
        <div className="md:col-span-3">
          <div className="font-medium text-base">
            {paymentMethod}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            {isInstant ? (
              <>
                <Bolt className="w-4 h-4 text-primary" />
                Instant release
              </>
            ) : (
              <><PaymentIcon />
              {location}  
              </> 
            )}
            {isKYCVerified && (
              <ShieldCheck className="w-4 h-4 text-primary" />
            )}
          </div>
        </div>

        {/* Price Column */}
        <div className="md:col-span-2">
          <div className={`text-2xl font-bold ${
            isPositive ? 'text-success' : 'text-foreground'
          }`}>
            {price} <span className="text-sm opacity-70">{currency}</span>
          </div>
          {belowMarket && (
            <div className="text-sm text-muted-foreground mt-1">
              {belowMarket} below market
            </div>
          )}
        </div>

        {/* Limits Column */}
        <div className="md:col-span-2">
          <div className="font-mono opacity-80 text-sm">
            {limits}
          </div>
          <div className="text-xs text-muted-foreground uppercase tracking-tighter mt-1">
            {limitLabel || 'Available liquidity'}
          </div>
        </div>

        {/* Action Column */}
        <div className="md:col-span-2 flex items-center justify-end gap-3">
          <Button
            onClick={onTrade}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
          >
            Trade
          </Button>
        </div>
      </div>
    </div>
  )
}
