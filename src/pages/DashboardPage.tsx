import { useAccount } from 'wagmi'
import { MetricCard } from '@/components/custom/MetricCard'
import { StatDividerGrid } from '@/components/custom/StatDividerGrid'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { PageContainer } from '@/components/layout/PageContainer'

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
            <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

        {/* Top Stats */}
        <StatDividerGrid>
          <div className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Total Volume</div>
            <div className="text-3xl font-bold font-mono">$124,500</div>
            <div className="text-sm text-muted-foreground mt-2">Lifetime</div>
          </div>
          <div className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Active Trades</div>
            <div className="text-3xl font-bold font-mono">3</div>
            <div className="text-sm text-muted-foreground mt-2">In progress</div>
          </div>
          <div className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Success Rate</div>
            <div className="text-3xl font-bold font-mono">98.5%</div>
            <div className="text-sm text-muted-foreground mt-2">200 trades</div>
          </div>
        </StatDividerGrid>

        {/* Recent Activity */}
        <Card className="bg-card border-border rounded-2xl p-4 shadow-none mt-8">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="rounded-full">
                  Buy
                </Badge>
                <div>
                  <div className="font-mono">0.5 ETH</div>
                  <div className="text-sm text-muted-foreground">
                    0x1234...5678
                  </div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">2 hours ago</div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="rounded-full">
                  Sell
                </Badge>
                <div>
                  <div className="font-mono">1500 USDC</div>
                  <div className="text-sm text-muted-foreground">
                    0xabcd...ef12
                  </div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">5 hours ago</div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="rounded-full">
                  Buy
                </Badge>
                <div>
                  <div className="font-mono">1.2 ETH</div>
                  <div className="text-sm text-muted-foreground">
                    0x9876...4321
                  </div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">1 day ago</div>
            </div>
          </div>
        </Card>
          </section>
        </PageContainer>
      </main>
      <Footer />
    </div>
  )
}
