import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { PageContainer } from '@/components/layout/PageContainer'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { TypingEffect } from '@/components/ui/typing-effect'
import MotionButton from '@/components/ui/motion-button'
import InteractiveHoverButton from '@/components/ui/interactive-hover-button'
import { SectionHeader } from '@/components/ui/section-header'
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

export function LandingPage() {
  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* Background Mesh Gradient */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-3/4 left-1/2 w-96 h-96 bg-blue-900/20 rounded-full blur-[120px]" />
      </div>

      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <PageContainer type="landing">
          <section className="py-20 md:py-32 text-center">
            <div className="mb-6 flex justify-center">
              <TypingEffect
                texts={['Trustless', 'Secure', 'Private']}
                className="text-5xl md:text-7xl font-bold text-foreground"
              />
              <h1 className="text-5xl md:text-7xl font-bold text-foreground ml-2">
                P2P Crypto
              </h1>
            </div>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Trade cryptocurrency peer-to-peer with smart contract escrow.
              Non-custodial, secure, and permissionless.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/app/dashboard">
                <InteractiveHoverButton text="Open App" classes="bg-primary text-primary-foreground" />
              </Link>
              <Button
                variant="outline"
                className="rounded-full shadow-none px-8 py-6 text-lg"
              >
                Documentation
              </Button>
            </div>
          </section>
        </PageContainer>

        {/* How It Works Section */}
        <PageContainer type="landing">
          <section className="py-20">
            <SectionHeader
              title="How It Works"
              description="Four simple steps to start trading with confidence"
            />
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
        </PageContainer>

        {/* Features Section - Bento Grid */}
        <PageContainer type="landing">
          <section className="py-20">
            <SectionHeader
              title="Built for Trustless Trading"
              description="Discover why thousands of traders trust our platform"
              align="center"
              maxWidth="3xl"
            />

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
                  <p className="text-sm leading-relaxed text-muted-foreground mb-4">
                    Funds are locked in smart contracts, not our servers. Full control over your assets.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="rounded-lg p-3 aspect-video bg-muted/40 border" />
                    ))}
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
                  <p className="text-xs text-muted-foreground">
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
                  <p className="text-xs text-muted-foreground">
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
                  <p className="leading-relaxed text-sm text-muted-foreground">
                    Fully automated escrow logic. Open-source, auditable, and trustless by design.
                  </p>
                </Card>
              </div>
            </div>
          </section>
        </PageContainer>

        {/* FAQ Section */}
        <PageContainer type="landing">
          <section className="py-20">
            <SectionHeader
              title="Frequently Asked Questions"
              description="Quick answers to the questions we get the most"
              align="center"
              maxWidth="3xl"
            />

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
                <AccordionItem value="item-3" className="border-b px-4 last:border-b-0">
                  <AccordionTrigger className="text-left text-lg font-medium py-6 hover:no-underline">
                    How are disputes handled?
                  </AccordionTrigger>
                  <AccordionContent className="pb-6 text-muted-foreground leading-relaxed">
                    Disputes are resolved by decentralized community jurors.
                    Smart contract enforces their decision.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-4" className="px-4">
                  <AccordionTrigger className="text-left text-lg font-medium py-6 hover:no-underline">
                    Is it non-custodial?
                  </AccordionTrigger>
                  <AccordionContent className="pb-6 text-muted-foreground leading-relaxed">
                    Yes. You always control your private keys. Funds move only
                    when you sign transactions.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>
        </PageContainer>
      </main>

      <Footer />
    </div>
  )
}
