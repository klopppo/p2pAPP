import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const FAQ_ITEMS = [
  {
    question: 'Is CofferNode custodial?',
    answer: 'No. CofferNode is fully non-custodial. Your funds are locked in smart contracts (EIP-1167 clones) that execute based on consensus between trading parties. CofferNode never has access to your private keys or funds.',
  },
  {
    question: 'What chains are supported?',
    answer: 'Currently, CofferNode supports Ethereum mainnet and Sepolia testnet. We plan to expand to Layer 2 networks like Arbitrum, Optimism, and Base for lower gas costs.',
  },
  {
    question: 'Do I need KYC to use CofferNode?',
    answer: 'No. CofferNode is pseudonymous. Your wallet address is your identity. We don\'t collect personal information, and you can trade without revealing your real-world identity.',
  },
  {
    question: 'How are disputes resolved?',
    answer: 'Disputes are resolved by Kleros, a decentralized cryptoeconomic arbitration protocol. A panel of jurors reviews evidence from both parties and votes on the outcome. The ruling is executed on-chain automatically.',
  },
  {
    question: 'What happens if the other party disappears?',
    answer: 'If your counter-party becomes unresponsive, you can file a dispute after the trade\'s timeout period expires. The escrow contract will release funds to the responsive party based on the timeout rules.',
  },
  {
    question: 'How much does it cost to trade?',
    answer: 'CofferNode charges a small platform fee (currently 0.5% of trade value). Gas costs for deploying escrow contracts are paid by the initiator. There are no hidden fees.',
  },
  {
    question: 'Can I cancel an offer?',
    answer: 'Yes, you can cancel any active offer at any time before it\'s accepted. There\'s no penalty for cancelling. Once a trade is initiated and escrow is deployed, cancellation follows the timeout rules.',
  },
  {
    question: 'What payment methods are supported?',
    answer: 'Any payment method that works outside the blockchain: bank transfers (SEPA, SWIFT, ACH), PayPal, Venmo, cash in person, or any other arrangement between you and your counter-party.',
  },
  {
    question: 'Is my trading history private?',
    answer: 'Your trade completions are recorded on-chain (for reputation scoring), but the details of each trade — amounts, payment methods, messages — are stored on IPFS and only accessible to the parties involved.',
  },
  {
    question: 'How does the reputation system work?',
    answer: 'After each successful trade, both parties can rate each other. Your reputation score is visible on your profile and influences your visibility in search results. Higher reputation = more trust = more trades.',
  },
]

export default function FAQ() {
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <Text variant="h3" className="font-bold">
          Frequently Asked Questions
        </Text>
        <p className="text-muted-foreground max-w-2xl">
          Quick answers to common questions about using CofferNode.
        </p>
      </div>

      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-sm font-medium text-left">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>
    </section>
  )
}
