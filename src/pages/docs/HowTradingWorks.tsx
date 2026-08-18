import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Search, Handshake, Lock, CheckCircle, XCircle, MessageCircle } from 'lucide-react'

const FLOW_STEPS = [
  {
    icon: Search,
    title: '1. Find or Create an Offer',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    description: 'Browse the marketplace for offers matching your criteria — currency pair, payment method, price. Or create your own offer and wait for a counter-party.',
  },
  {
    icon: Handshake,
    title: '2. Initiate the Trade',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    description: 'Click "Initiate Trade" on an offer. This deploys a Kleros escrow contract and locks the seller\'s funds. Both parties are notified and can begin communicating.',
  },
  {
    icon: MessageCircle,
    title: '3. Communicate & Execute',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    description: 'Use the in-app chat to coordinate payment details. The buyer sends payment off-chain (bank transfer, cash, etc.) and the seller confirms receipt.',
  },
  {
    icon: Lock,
    title: '4. Escrow Holds Funds',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    description: 'Throughout the trade, funds remain locked in the non-custodial escrow contract. Neither party can move them unilaterally.',
  },
  {
    icon: CheckCircle,
    title: '5. Confirm & Release',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    description: 'Both parties confirm the trade is complete. The escrow releases funds to the seller, and the trade is marked as successful.',
  },
]

const DISPUTE_PATH = {
  icon: XCircle,
  title: 'Alternative: Dispute',
  color: 'text-red-400',
  bg: 'bg-red-500/10',
  description: 'If either party disagrees, they can file a dispute. A Kleros juror panel reviews evidence and rules on the outcome. Funds are distributed according to the ruling.',
}

export default function HowTradingWorks() {
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <Text variant="h3" className="font-bold">
          How Trading Works
        </Text>
        <p className="text-muted-foreground max-w-2xl">
          CofferNode uses a trustless escrow model. Your funds are never held by us — they
          live in smart contracts that execute based on consensus between trading parties.
        </p>
      </div>

      {/* Flow steps */}
      <div className="space-y-3">
        {FLOW_STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <Card key={i} className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
              <div className="flex gap-4">
                <div className={`w-10 h-10 rounded-xl ${step.bg} flex items-center justify-center shrink-0 ${step.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="space-y-2">
                  <Text variant="h4" className="font-semibold">{step.title}</Text>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Separator />

      {/* Dispute path */}
      <div className="space-y-3">
        <Text variant="h4" className="font-semibold">When Things Go Wrong</Text>
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-red-500/20 p-6 rounded-2xl">
          <div className="flex gap-4">
            <div className={`w-10 h-10 rounded-xl ${DISPUTE_PATH.bg} flex items-center justify-center shrink-0 ${DISPUTE_PATH.color}`}>
              <DISPUTE_PATH.icon className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <Text variant="h4" className="font-semibold">{DISPUTE_PATH.title}</Text>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {DISPUTE_PATH.description}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Key properties */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <Text variant="h4" className="font-semibold mb-4">Key Properties</Text>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Badge variant="default" className="rounded-full">Non-Custodial</Badge>
            <p className="text-sm text-muted-foreground">
              Funds are locked in EIP-1167 clone contracts. No central authority can access them.
            </p>
          </div>
          <div className="space-y-1">
            <Badge variant="default" className="rounded-full">Atomic</Badge>
            <p className="text-sm text-muted-foreground">
              Trades either complete fully or revert. No partial states.
            </p>
          </div>
          <div className="space-y-1">
            <Badge variant="default" className="rounded-full">Dispute-Resistant</Badge>
            <p className="text-sm text-muted-foreground">
              Kleros juror panels resolve disputes based on evidence, not trust.
            </p>
          </div>
          <div className="space-y-1">
            <Badge variant="default" className="rounded-full">Private</Badge>
            <p className="text-sm text-muted-foreground">
              No KYC required. Trade with any address, anywhere in the world.
            </p>
          </div>
        </div>
      </Card>
    </section>
  )
}
