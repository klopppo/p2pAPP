import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { LandingLayout } from '@/components/layout/LandingLayout'
import { Navbar } from '@/components/layout/Navbar'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { TypingEffect } from '@/components/ui/typing-effect'
import InteractiveHoverButton from '@/components/ui/interactive-hover-button'
import { NonCustodialGraphic } from '@/components/custom/NonCustodialGraphic'
import {
  Shield,
  Users,
  Coins,
  FileCode,
  User,
  Grid3x3,
  MessageCircle,
  Handshake,
} from 'lucide-react'
import { Marquee } from '@joycostudio/marquee/react'
import {
  TokenBTC,
  TokenETH,
  TokenUSDC,
  TokenUSDT,
  NetworkEthereum,
  NetworkBase,
  NetworkArbitrumOne,
  NetworkOptimism,
  NetworkPolygon,
} from '@web3icons/react'

export function LandingPage() {
  return (
    <LandingLayout>
      <>
        {/* Hero + Marquee — single screen */}
        <section className="relative min-h-[100dvh] flex flex-col px-4">
          {/* Navbar sits inside hero viewport, aligned to top */}
          <div className="absolute top-0 left-0 right-0 z-20">
            <Navbar />
          </div>
          {/* Hero title content — takes all space, centered vertically */}
          <div className="flex-1 flex flex-col justify-center items-center pb-12">
            <div className="mx-auto max-w-4xl text-center space-y-3">
              <div className="flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500/60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                  Online now
                </span>
              </div>
              <div className="flex justify-center">
                <TypingEffect
                  texts={['Trustless', 'Secure', 'Private']}
                  className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground"
                />
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground tracking-tight ml-2">
                  P2P Crypto
                </h1>
              </div>
              <p className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed text-muted-foreground">
                Trade cryptocurrency peer-to-peer with smart contract escrow.
                Non-custodial, secure, and permissionless.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
              <Link to="/app/offers">
                <InteractiveHoverButton text="Open App" classes="bg-primary text-primary-foreground" />
              </Link>
            </div>
          </div>

          {/* Marquee — pinned to bottom of first screen, full viewport width with edge fade */}
          <div className="w-screen relative left-1/2 -translate-x-1/2 mt-auto pb-6">
            <div
              className="w-full overflow-hidden py-4
                         [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]
                         [-webkit-mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]"
            >
              <Marquee speed={25} speedFactor={1} direction={1}>
                <div className="flex items-end gap-12">
                  {/* Icons — duplicated for seamless loop, grayscaled/muted, subtle random vertical offset */}
                  <TokenBTC size={56} variant="branded" className="grayscale opacity-70 mb-1" />
                  <TokenETH size={56} variant="branded" className="grayscale opacity-70 -mb-0.5" />
                  <TokenUSDC size={56} variant="branded" className="grayscale opacity-70 mb-1.5" />
                  <TokenUSDT size={56} variant="branded" className="grayscale opacity-70 -mb-1" />
                  <NetworkEthereum size={56} variant="branded" className="grayscale opacity-70" />
                  <NetworkBase size={56} variant="branded" className="grayscale opacity-70 mb-0.5" />
                  <NetworkArbitrumOne size={56} variant="branded" className="grayscale opacity-70 -mb-0.5" />
                  <NetworkOptimism size={56} variant="branded" className="grayscale opacity-70 mb-1" />
                  <NetworkPolygon size={56} variant="branded" className="grayscale opacity-70" />
                  {/* Same set again for continuous scroll */}
                  <TokenBTC size={56} variant="branded" className="grayscale opacity-70 mb-1" />
                  <TokenETH size={56} variant="branded" className="grayscale opacity-70 -mb-0.5" />
                  <TokenUSDC size={56} variant="branded" className="grayscale opacity-70 mb-1.5" />
                  <TokenUSDT size={56} variant="branded" className="grayscale opacity-70 -mb-1" />
                  <NetworkEthereum size={56} variant="branded" className="grayscale opacity-70" />
                  <NetworkBase size={56} variant="branded" className="grayscale opacity-70 mb-0.5" />
                  <NetworkArbitrumOne size={56} variant="branded" className="grayscale opacity-70 -mb-0.5" />
                  <NetworkOptimism size={56} variant="branded" className="grayscale opacity-70 mb-1" />
                  <NetworkPolygon size={56} variant="branded" className="grayscale opacity-70" />
                </div>
              </Marquee>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-20 md:py-32 px-4">
          <div className="mx-auto max-w-4xl text-center mb-16">
            <p className="text-xs font-medium uppercase tracking-[0.2em] mb-2">
              SIMPLE PROCESS
            </p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-2">
              How it works
            </h2>
            <p className="text-base md:text-lg max-w-2xl mx-auto leading-relaxed text-muted-foreground">
              From contact to trade in four straightforward steps.
            </p>
          </div>
          <div className="relative">
            {/* 4-column grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              {/* Step 01 */}
              <div className="relative group hover:-translate-y-1 transition-transform duration-300">
                <div className="text-foreground/5 text-[48px] font-extrabold leading-none absolute -top-4 -left-1 pointer-events-none md:text-[72px] md:-top-6 md:-left-2">01</div>
                <div className="relative pt-8 md:pt-16">
                  <div className="w-10 h-10 rounded-full border border-foreground/10 flex items-center justify-center mb-4 group-hover:border-primary transition-colors">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg md:text-2xl font-bold mb-3">Add your contacts securely</h3>
                  <p className="text-sm text-muted-foreground max-w-[200px]">
                    Create your trusted network and discover offers from friends, and friends of friends.
                  </p>
                </div>
              </div>

              {/* Step 02 */}
              <div className="relative group hover:-translate-y-1 transition-transform duration-300">
                <div className="text-foreground/5 text-[48px] font-extrabold leading-none absolute -top-4 -left-1 pointer-events-none md:text-[72px] md:-top-6 md:-left-2">02</div>
                <div className="relative pt-8 md:pt-16">
                  <div className="w-10 h-10 rounded-full border border-foreground/10 flex items-center justify-center mb-4 group-hover:border-primary transition-colors">
                    <Grid3x3 className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg md:text-2xl font-bold mb-3">Browse or add offers</h3>
                  <p className="text-sm text-muted-foreground max-w-[200px]">
                    Vexl works as a private marketplace. Browse or add offers and choose who you want to connect with.
                  </p>
                </div>
              </div>

              {/* Step 03 */}
              <div className="relative group hover:-translate-y-1 transition-transform duration-300">
                <div className="text-foreground/5 text-[48px] font-extrabold leading-none absolute -top-4 -left-1 pointer-events-none md:text-[72px] md:-top-6 md:-left-2">03</div>
                <div className="relative pt-8 md:pt-16">
                  <div className="w-10 h-10 rounded-full border border-foreground/10 flex items-center justify-center mb-4 group-hover:border-primary transition-colors">
                    <MessageCircle className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg md:text-2xl font-bold mb-3">Chat anonymously</h3>
                  <p className="text-sm text-muted-foreground max-w-[200px]">
                    Send or receive request based on an offer. Chat anonymously until you decide to reveal your identity.
                  </p>
                </div>
              </div>

              {/* Step 04 */}
              <div className="relative group hover:-translate-y-1 transition-transform duration-300">
                <div className="text-foreground/5 text-[48px] font-extrabold leading-none absolute -top-4 -left-1 pointer-events-none md:text-[72px] md:-top-6 md:-left-2">04</div>
                <div className="relative pt-8 md:pt-16">
                  <div className="w-10 h-10 rounded-full border border-foreground/10 flex items-center justify-center mb-4 group-hover:border-primary transition-colors">
                    <Handshake className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg md:text-2xl font-bold mb-3">Meet & trade privately</h3>
                  <p className="text-sm text-muted-foreground max-w-[200px]">
                    Agree on the details, meet in person, and exchange privately. Vexl never handles your money or tracks your purchases.
                  </p>
                </div>
              </div>
            </div>

            {/* Progress line */}
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-foreground/10 -translate-y-1/2 pointer-events-none"></div>
          </div>
        </section>

        {/* Features Section - Bento Grid */}
        <section className="py-20 md:py-32 px-4">
            <div className="mx-auto max-w-4xl text-center mb-12">
              <p className="text-xs font-medium uppercase tracking-[0.2em] mb-2">
                WHY CHOOSE US
              </p>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-2">
                Built for Trustless Trading
              </h2>
              <p className="text-base md:text-lg max-w-2xl mx-auto leading-relaxed text-muted-foreground">
                Smart contract escrow, zero platform fees, and full control over your assets.
              </p>
            </div>

            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3">
                {/* Card 1 - Large, spans 2 cols + 2 rows */}
                <Card className="md:col-span-2 md:row-span-2 group relative overflow-hidden rounded-3xl border p-4 md:p-5 shadow-none min-h-[280px]">
                  <div className="flex flex-row items-start justify-between pb-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Non-Custodial</p>
                      <h3 className="text-xl md:text-2xl font-bold">You hold your keys</h3>
                    </div>
                    <div className="rounded-lg p-2 bg-primary/10">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <p className="text-base leading-relaxed text-muted-foreground mb-4">
                    Funds are locked in smart contracts, not our servers. Full control over your assets.
                  </p>
                  <div className="rounded-xl overflow-hidden border border-border bg-background flex items-center justify-center p-4">
                    <NonCustodialGraphic className="block w-full max-w-md text-foreground" />
                  </div>
                </Card>

                {/* Card 2 - Top right */}
                <Card className="rounded-3xl border p-4 md:p-5 shadow-none min-h-[120px]">
                  <div className="flex flex-row items-start justify-between pb-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">P2P</p>
                      <h3 className="text-lg md:text-xl font-bold">No Middleman</h3>
                    </div>
                    <div className="rounded-lg p-2 bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Direct trades. No centralized entity can freeze you.
                  </p>
                </Card>

                {/* Card 3 - Bottom right */}
                <Card className="rounded-3xl border p-4 md:p-5 shadow-none min-h-[120px]">
                  <div className="flex flex-row items-start justify-between pb-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cost</p>
                      <h3 className="text-lg md:text-xl font-bold">Low Fees</h3>
                    </div>
                    <div className="rounded-lg p-2 bg-primary/10">
                      <Coins className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Zero platform fees. Only standard network gas.
                  </p>
                </Card>

                {/* Card 4 - Full width bottom */}
                <Card className="md:col-span-3 rounded-3xl border p-4 md:p-5 shadow-none">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Code</p>
                      <h3 className="text-lg md:text-xl font-bold">Smart Contract Based</h3>
                    </div>
                    <div className="rounded-lg p-2 bg-primary/10">
                      <FileCode className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <p className="leading-relaxed text-base text-muted-foreground">
                    Fully automated escrow logic. Open-source, auditable, and trustless by design.
                  </p>
                </Card>
              </div>
            </div>
          </section>

        {/* FAQ Section */}
        <section className="py-20 md:py-32 px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-medium uppercase tracking-[0.2em] mb-2">
              FAQ
            </p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-2">
              Frequently asked questions
            </h2>
            <p className="text-base md:text-lg max-w-2xl mx-auto leading-relaxed text-muted-foreground">
              Quick answers to the questions we get the most.
            </p>
          </div>

          <div className="mt-12 max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="w-full rounded-2xl border bg-card p-2">
              <AccordionItem value="item-1" className="border-b px-4 last:border-b-0">
                <AccordionTrigger className="text-left text-lg font-medium py-6 hover:no-underline">
                  Is my crypto safe?
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-muted-foreground leading-relaxed">
                  Yes. Funds are locked in smart contract escrow, released
                  only when both parties confirm. We never hold your crypto.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="border-b px-4 last:border-b-0">
                <AccordionTrigger className="text-left text-lg font-medium py-6 hover:no-underline">
                  What are the fees?
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-muted-foreground leading-relaxed">
                  Zero platform fees. You only pay standard network gas for
                  on-chain transactions.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="border-b px-4 last:border-b-0">
                <AccordionTrigger className="text-left text-lg font-medium py-6 hover:no-underline">
                  Is it non-custodial?
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-muted-foreground leading-relaxed">
                  Yes. You always control your private keys. Funds move only
                  when you sign transactions.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-5" className="border-b px-4 last:border-b-0">
                <AccordionTrigger className="text-left text-lg font-medium py-6 hover:no-underline">
                  Do I need to trust the other person?
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-muted-foreground leading-relaxed">
                  No. The crypto is locked in a smart contract that neither the buyer nor the seller can touch alone. Only after the buyer confirms, or after a dispute is resolved by the arbitrator, are the funds released.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-6" className="border-b px-4 last:border-b-0">
                <AccordionTrigger className="text-left text-lg font-medium py-6 hover:no-underline">
                  What if there's a disagreement (dispute)?
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-muted-foreground leading-relaxed">
                  Either party can open a dispute. The platform's arbitrator will review the evidence and decide whether the funds go to the seller or back to the buyer. The arbitrator's decision is final.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-7" className="px-4">
                <AccordionTrigger className="text-left text-lg font-medium py-6 hover:no-underline">
                  What cryptocurrencies can I use?
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-muted-foreground leading-relaxed">
                  The platform supports any ERC-20 token (like USDC, DAI, USDT) that the seller chooses to accept. The contract handles the token securely.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>
      </>
    </LandingLayout>
  )
}
