import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Shield, FileCode, Users, AlertTriangle, Lock, Eye } from 'lucide-react'

export default function EscrowAndSecurity() {
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <Text variant="h3" className="font-bold">
          Escrow & Security
        </Text>
        <p className="text-muted-foreground max-w-2xl">
          CofferNode's security model is built on Ethereum smart contracts, Kleros decentralized
          arbitration, and IPFS-based data storage. No trust in intermediaries required.
        </p>
      </div>

      {/* Architecture overview */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <FileCode className="w-5 h-5" />
            </div>
            <Text variant="h4" className="font-semibold">EIP-1167 Minimal Proxy Clones</Text>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Each trade deploys a minimal proxy clone (EIP-1167) of the CofferNode escrow contract.
              This is extremely gas-efficient — deploying a clone costs ~45k gas vs ~2M for a full contract.
            </p>
            <p>
              The clone is initialized with the trade parameters: buyer address, seller address,
              amount, and arbiter. Once deployed, the contract is immutable — no one can modify
              its logic or override its rules.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full">EIP-1167</Badge>
            <Badge variant="secondary" className="rounded-full">Minimal Proxy</Badge>
            <Badge variant="secondary" className="rounded-full">Gas Efficient</Badge>
            <Badge variant="secondary" className="rounded-full">Immutable</Badge>
          </div>
        </div>
      </Card>

      {/* Trust model */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400">
              <Shield className="w-5 h-5" />
            </div>
            <Text variant="h4" className="font-semibold">Trust Model</Text>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              CofferNode operates on a <strong className="text-foreground">zero-trust</strong> principle.
              The platform never has custody of your funds, never sees your private keys,
              and cannot influence trade outcomes.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/50 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-foreground font-medium text-xs">Funds</span>
                </div>
                <p className="text-xs">Locked in smart contracts. Released only by consensus or juror ruling.</p>
              </div>
              <div className="rounded-xl border border-border/50 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-foreground font-medium text-xs">Data</span>
                </div>
                <p className="text-xs">Stored on IPFS via Helia. No central database. You control your data.</p>
              </div>
              <div className="rounded-xl border border-border/50 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-foreground font-medium text-xs">Identity</span>
                </div>
                <p className="text-xs">Pseudonymous. No KYC. Your wallet address is your identity.</p>
              </div>
              <div className="rounded-xl border border-border/50 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-foreground font-medium text-xs">Disputes</span>
                </div>
                <p className="text-xs">Resolved by Kleros jurors — a decentralized, cryptoeconomic dispute resolution layer.</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Separator />

      {/* Kleros integration */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <Text variant="h4" className="font-semibold">Kleros Arbitration</Text>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              When a dispute is filed, the escrow contract automatically requests arbitration
              from the Kleros court. A panel of jurors reviews the evidence submitted by both
              parties and votes on the outcome.
            </p>
            <p>
              Jurors are incentivized to vote honestly through Kleros's cryptoeconomic
              mechanism: the majority ruling is finalized, and minority voters lose their
              stake. This makes collusion and bribery economically irrational.
            </p>
            <p>
              Rulings are final and executed on-chain. Once the juror panel reaches consensus,
              the escrow contract automatically distributes funds according to the ruling.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full">Decentralized</Badge>
            <Badge variant="secondary" className="rounded-full">Cryptoeconomic</Badge>
            <Badge variant="secondary" className="rounded-full">On-Chain Execution</Badge>
          </div>
        </div>
      </Card>
    </section>
  )
}
