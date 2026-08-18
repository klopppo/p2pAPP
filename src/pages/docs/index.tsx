import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import {
  Rocket,
  ArrowLeftRight,
  Shield,
  FileEdit,
  Gavel,
  HelpCircle,
  ArrowRight,
} from 'lucide-react'

const SECTIONS = [
  {
    icon: Rocket,
    title: 'Getting Started',
    description: 'Connect your wallet, set up your profile, and make your first trade in minutes.',
    to: '/docs/getting-started',
    color: 'text-cyan-400',
  },
  {
    icon: ArrowLeftRight,
    title: 'How Trading Works',
    description: 'Understand the full P2P flow from listing an offer to completing a trade.',
    to: '/docs/how-trading-works',
    color: 'text-green-400',
  },
  {
    icon: Shield,
    title: 'Escrow & Security',
    description: 'Deep dive into Kleros-powered escrow, EIP-1167 clones, and the trust model.',
    to: '/docs/escrow-and-security',
    color: 'text-purple-400',
  },
  {
    icon: FileEdit,
    title: 'Creating Offers',
    description: 'Step-by-step guide to listing buy and sell offers on the marketplace.',
    to: '/docs/creating-offers',
    color: 'text-amber-400',
  },
  {
    icon: Gavel,
    title: 'Disputes',
    description: 'How to file and resolve disputes when trades go wrong.',
    to: '/docs/disputes',
    color: 'text-red-400',
  },
  {
    icon: HelpCircle,
    title: 'FAQ',
    description: 'Answers to the most common questions about CofferNode.',
    to: '/docs/faq',
    color: 'text-blue-400',
  },
]

export default function DocsIndex() {
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          CofferNode Documentation
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Everything you need to know about trading trustless peer-to-peer.
          Start with the basics or jump into the technical details.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <Link key={section.to} to={section.to}>
              <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl h-full hover:bg-muted/30 transition-colors group cursor-pointer">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center ${section.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {section.title}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {section.description}
                  </p>
                  <div className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Read more
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
