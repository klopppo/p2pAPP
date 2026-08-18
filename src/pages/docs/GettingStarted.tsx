import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Badge } from '@/components/ui/badge'
import { Wallet, User, Shield, ArrowLeftRight } from 'lucide-react'

export default function GettingStarted() {
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <Text variant="h3" className="font-bold">
          Getting Started
        </Text>
        <p className="text-muted-foreground max-w-2xl">
          Get up and running with CofferNode in under 5 minutes.
          All you need is an Ethereum wallet and some ETH for gas.
        </p>
      </div>

      {/* Step 1 */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <Badge variant="secondary" className="rounded-full mb-1">Step 1</Badge>
              <Text variant="h4" className="font-semibold">Connect Your Wallet</Text>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Click the <strong className="text-foreground">Connect Wallet</strong> button in the
              top right corner. CofferNode supports MetaMask, WalletConnect, Coinbase Wallet,
              and any EIP-1193 compatible provider.
            </p>
            <p>
              We recommend using a dedicated wallet for P2P trading — never your main holdings wallet.
              Generate a fresh address specifically for CofferNode trades.
            </p>
          </div>
        </div>
      </Card>

      {/* Step 2 */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <Badge variant="secondary" className="rounded-full mb-1">Step 2</Badge>
              <Text variant="h4" className="font-semibold">Set Up Your Profile</Text>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              After connecting, head to your <strong className="text-foreground">Profile</strong> page.
              Add a display name, avatar, and optional bio. Your profile is stored on-chain via
              Supabase — no personal data is ever sent to a centralized server.
            </p>
            <p>
              A complete profile builds trust with other traders. Users with verified profiles
              receive higher visibility in search results.
            </p>
          </div>
        </div>
      </Card>

      {/* Step 3 */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <Badge variant="secondary" className="rounded-full mb-1">Step 3</Badge>
              <Text variant="h4" className="font-semibold">Understand the Escrow</Text>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Every trade on CofferNode is protected by a <strong className="text-foreground">Kleros-powered
              escrow contract</strong>. When you initiate a trade, funds are locked in a non-custodial
              smart contract — not held by CofferNode or any third party.
            </p>
            <p>
              The escrow releases funds only when both parties confirm the trade, or when a
              dispute resolver rules on the outcome. See the{' '}
              <strong className="text-foreground">Escrow & Security</strong> section for technical details.
            </p>
          </div>
        </div>
      </Card>

      {/* Step 4 */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <Badge variant="secondary" className="rounded-full mb-1">Step 4</Badge>
              <Text variant="h4" className="font-semibold">Start Trading</Text>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Browse the <strong className="text-foreground">Offers</strong> marketplace to find
              trades that match your needs. Filter by currency, payment method, or price range.
            </p>
            <p>
              When you find an offer you like, click <strong className="text-foreground">Initiate Trade</strong> to
              begin. The escrow contract is deployed automatically, and both parties are notified
              via the in-app messaging system.
            </p>
          </div>
        </div>
      </Card>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
        <Text variant="h4" className="font-semibold mb-2">Ready to trade?</Text>
        <p className="text-sm text-muted-foreground">
          Head to the <strong className="text-foreground">Offers</strong> page to browse available trades,
          or create your own offer to attract counter-parties.
        </p>
      </div>
    </section>
  )
}
