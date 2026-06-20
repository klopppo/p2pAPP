import { useAccount, useDisconnect } from 'wagmi'
import { MetricCard } from '@/components/custom/MetricCard'
import { StatDividerGrid } from '@/components/custom/StatDividerGrid'
import { OfferRow } from '@/components/custom/OfferRow'
import { FilterDropdown } from '@/components/custom/FilterDropdown'
import { OffersTableWrapper } from '@/components/custom/OffersTableWrapper'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { PageContainer } from '@/components/layout/PageContainer'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function DashboardPage() {
  const { isConnected } = useAccount()

  if (!isConnected) {
    return (
      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[120px]" />
          <div className="absolute top-3/4 left-1/2 w-96 h-96 bg-blue-900/20 rounded-full blur-[120px]" />
        </div>

        <Navbar showTabs />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-6">
              Connect to view your dashboard and trade
            </p>
            <p className="text-muted-foreground">Use the wallet button in the navigation</p>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-3/4 left-1/2 w-96 h-96 bg-blue-900/20 rounded-full blur-[120px]" />
      </div>

      <Navbar showTabs />
      <main className="flex-1">
        <PageContainer type="app">
          <section className="py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-3xl font-bold">Market Offers</h1>
              <Button className="rounded-full shadow-none bg-primary text-primary-foreground hover:bg-primary/90">
                Post Offer
              </Button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap gap-4 mb-8">
              <FilterDropdown
                label="Currency"
                selectedValue="EUR"
                options={[
                  { value: 'EUR', label: 'EUR', icon: '€' },
                  { value: 'USD', label: 'USD', icon: '$' },
                  { value: 'GBP', label: 'GBP', icon: '£' },
                  { value: 'BTC', label: 'BTC', icon: '₿' },
                  { value: 'ETH', label: 'ETH', icon: 'Ξ' },
                ]}
                onValueChange={(value) => console.log(value)}
              />
              <FilterDropdown
                label="Payment Method"
                selectedValue="SEPA Instant"
                options={[
                  { value: 'SEPA Instant', label: 'SEPA Instant' },
                  { value: 'Bank Transfer', label: 'Bank Transfer' },
                  { value: 'PayPal', label: 'PayPal' },
                  { value: 'Wise', label: 'Wise' },
                  { value: 'Cash', label: 'Cash' },
                ]}
                onValueChange={(value) => console.log(value)}
              />
              <FilterDropdown
                label="Location"
                selectedValue="Italy"
                options={[
                  { value: 'Italy', label: 'Italy' },
                  { value: 'Global', label: 'Global' },
                  { value: 'Germany', label: 'Germany' },
                  { value: 'France', label: 'France' },
                  { value: 'Spain', label: 'Spain' },
                ]}
                onValueChange={(value) => console.log(value)}
              />
              <div className="flex flex-col gap-1.5 ml-auto">
                <span className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider px-1 invisible">
                  Search
                </span>
                <div className="relative">
                  <Input
                    placeholder="Search traders..."
                    className="bg-surface-container-low border-border focus:border-primary focus:ring-0 pl-10 pr-4 py-2.5 rounded-xl text-on-surface w-full md:w-64 transition-all"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* Offers Table */}
            <OffersTableWrapper>
              {/* Table Header */}
              <div className="hidden md:grid grid-cols-12 px-6 text-[13px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60 mb-4">
                <div className="col-span-3">Trader</div>
                <div className="col-span-3">Payment & Region</div>
                <div className="col-span-2">Price Per Unit</div>
                <div className="col-span-2">Limits</div>
                <div className="col-span-2 text-right">Action</div>
              </div>

              {/* Offer Rows */}
              <div className="space-y-4">
                <OfferRow
                  trader="0x8421aF3d...9B8C7E"
                  traderName="trade84"
                  rating="★ 4.98"
                  trades="27.8k"
                  paymentMethod="SEPA Instant"
                  paymentMethodIcon={<span>🏦</span>}
                  location="Italy"
                  isInstant
                  price="€0.84"
                  currency="EUR"
                  priceChange="+2.4%"
                  belowMarket="2.5%"
                  limits="€500 - €50,000"
                  limitLabel="Available liquidity"
                  isPositive={true}
                  sparkline={[0.82, 0.83, 0.82, 0.83, 0.84, 0.84]}
                  onTrade={() => console.log('Trade with trade84')}
                />
                <OfferRow
                  trader="0xB2a3F7c9...4D5E6F"
                  traderName="Brianx786"
                  rating="★ 4.99"
                  trades="12.1k"
                  paymentMethod="PayPal Friends & Family"
                  paymentMethodIcon={<span>💳</span>}
                  location="Global"
                  isInstant
                  isKYCVerified
                  price="€52,411"
                  currency="EUR"
                  priceChange="+5.9%"
                  belowMarket="5.9%"
                  limits="€200 - €150,000"
                  limitLabel="Large volume specialist"
                  isPositive={true}
                  sparkline={[52000, 52100, 52200, 52300, 52400, 52411]}
                  onTrade={() => console.log('Trade with Brianx786')}
                />
                <OfferRow
                  trader="0xC4d5E8f2...1A2B3C"
                  traderName="TokyoTrade"
                  rating="★ 4.91"
                  trades="9.3k"
                  paymentMethod="Wise Transfer"
                  paymentMethodIcon={<span>🌐</span>}
                  location="Global"
                  price="€52,684"
                  currency="EUR"
                  priceChange="+5.5%"
                  belowMarket="5.5%"
                  limits="€100 - €2,000"
                  limitLabel="Fast micro-trades"
                  isPositive={true}
                  sparkline={[52000, 52100, 52200, 52300, 52400, 52684]}
                  onTrade={() => console.log('Trade with TokyoTrade')}
                />
                <OfferRow
                  trader="0xD6e7F9g3...5C6D7E"
                  traderName="technodj2"
                  rating="★ 4.95"
                  trades="4.2k"
                  paymentMethod="SEPA Instant"
                  paymentMethodIcon={<span>🏦</span>}
                  location="Italy"
                  isInstant
                  isKYCVerified
                  price="€52,750"
                  currency="EUR"
                  priceChange="+0.8%"
                  belowMarket="0.8%"
                  limits="€50 - €10,000"
                  limitLabel="KYC Verified"
                  isPositive={true}
                  sparkline={[52200, 52300, 52350, 52400, 52450, 52750]}
                  onTrade={() => console.log('Trade with technodj2')}
                />
                <OfferRow
                  trader="0xE8f9G0h4...7D8E9F"
                  traderName="CryptoKing"
                  rating="★ 4.97"
                  trades="8.7k"
                  paymentMethod="Bank Transfer"
                  paymentMethodIcon={<span>🅱️</span>}
                  location="Germany"
                  price="€52,890"
                  currency="EUR"
                  priceChange="+0.5%"
                  belowMarket="0.5%"
                  limits="€1,000 - €100,000"
                  limitLabel="Direct bank transfer"
                  isPositive={true}
                  sparkline={[52500, 52600, 52650, 52700, 52750, 52890]}
                  onTrade={() => console.log('Trade with CryptoKing')}
                />
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-border/50">
                <div className="text-sm text-muted-foreground">
                  Showing {4} of {20} offers
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="rounded-full">
                    Previous
                  </Button>
                  <Button variant="ghost" size="sm" className="rounded-full">
                    1
                  </Button>
                  <Button variant="ghost" size="sm" className="rounded-full">
                    2
                  </Button>
                  <Button variant="ghost" size="sm" className="rounded-full">
                    3
                  </Button>
                  <Button variant="ghost" size="sm" className="rounded-full">
                    Next
                  </Button>
                </div>
              </div>
            </OffersTableWrapper>
          </section>
        </PageContainer>
      </main>
      <Footer />
    </div>
  )
}
