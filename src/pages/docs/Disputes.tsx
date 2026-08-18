import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Gavel, AlertTriangle, FileText, Scale, Clock, CheckCircle } from 'lucide-react'

export default function Disputes() {
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <Text variant="h3" className="font-bold">
          Disputes & Resolution
        </Text>
        <p className="text-muted-foreground max-w-2xl">
          When a trade goes wrong, CofferNode's dispute system ensures fair resolution
          through decentralized Kleros arbitration — not centralized support tickets.
        </p>
      </div>

      {/* When to file */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <Text variant="h4" className="font-semibold">When to File a Dispute</Text>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              File a dispute only when direct communication with your counter-party has failed.
              Common scenarios include:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>The buyer claims they sent payment but the seller didn't receive it</li>
              <li>The seller received payment but refuses to confirm</li>
              <li>One party becomes unresponsive after trade initiation</li>
              <li>The payment amount doesn't match the agreed terms</li>
              <li>Evidence of fraud or malicious behavior</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* How disputes work */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Scale className="w-5 h-5" />
            </div>
            <Text variant="h4" className="font-semibold">How Resolution Works</Text>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">1</div>
              <div>
                <p className="text-sm font-medium text-foreground">File the Dispute</p>
                <p className="text-xs text-muted-foreground">
                  Click "File Dispute" on the trade detail page. Provide a reason and upload
                  supporting evidence (screenshots, transaction hashes, etc.).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">2</div>
              <div>
                <p className="text-sm font-medium text-foreground">Evidence Period</p>
                <p className="text-xs text-muted-foreground">
                  Both parties have a window to submit evidence. The counter-party is notified
                  and given equal opportunity to present their case.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">3</div>
              <div>
                <p className="text-sm font-medium text-foreground">Kleros Jury Review</p>
                <p className="text-xs text-muted-foreground">
                  A panel of Kleros jurors reviews the evidence and votes. The cryptoeconomic
                  mechanism incentivizes honest voting.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">4</div>
              <div>
                <p className="text-sm font-medium text-foreground">On-Chain Execution</p>
                <p className="text-xs text-muted-foreground">
                  The ruling is final. Funds are automatically distributed according to the
                  jury's decision. No appeals, no manual intervention.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Separator />

      {/* Tips */}
      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-4">
          <Text variant="h4" className="font-semibold">Tips for Strong Disputes</Text>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="evidence">
              <AccordionTrigger className="text-sm font-medium">Gather evidence before filing</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Screenshots of conversations, transaction hashes, bank receipts, and timestamps
                all strengthen your case. The more evidence you provide, the clearer the ruling.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="timeline">
              <AccordionTrigger className="text-sm font-medium">Stick to the timeline</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Each phase has a deadline. Missing the evidence submission window weakens your
                position significantly. Set reminders and respond promptly.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="honesty">
              <AccordionTrigger className="text-sm font-medium">Be honest and factual</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Jurors are incentivized to vote with the majority. Filing frivolous disputes
                wastes your gas and can damage your reputation score.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="communication">
              <AccordionTrigger className="text-sm font-medium">Try to resolve first</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Most disputes stem from miscommunication. Use the in-app chat to clarify before
                escalating. A quick message can save both parties time and gas.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </Card>
    </section>
  )
}
