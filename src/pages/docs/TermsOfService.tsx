import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const LAST_REVISED = 'August 19, 2026'

/**
 * Terms of Service — CofferNode
 *
 * Comprehensive legal document modeled after industry-standard ToS from
 * Pendle Finance, Uniswap Labs, and other leading DeFi protocols.
 * Covers non-custodial P2P trading, smart-contract escrow, user
 * obligations, risk disclosures, and liability limitations.
 */
export default function TermsOfService() {
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <Text variant="h3" className="font-bold">
          Terms of Service
        </Text>
        <p className="text-sm text-muted-foreground">
          Date Last Revised: {LAST_REVISED} (&ldquo;<strong>Date Last Revised</strong>&rdquo;)
        </p>
      </div>

      <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
        <div className="space-y-8 text-sm leading-7 text-foreground/90">

          {/* ─── PREAMBLE ─── */}
          <div className="space-y-4">
            <p>
              These Terms of Service (the &ldquo;<strong>Terms</strong>&rdquo;) constitute a legally binding
              agreement between you (&ldquo;<strong>you</strong>&rdquo;, &ldquo;<strong>your</strong>&rdquo;, or
              &ldquo;<strong>User</strong>&rdquo;) and CofferNode (&ldquo;<strong>Company</strong>&rdquo;,
              &ldquo;<strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;, or &ldquo;<strong>our</strong>&rdquo;)
              governing your access to and use of the website located at{' '}
              <span className="text-primary font-medium">coffernode.com</span> (the &ldquo;<strong>Website</strong>&rdquo;),
              all associated applications, interfaces, smart contracts, application programming interfaces (APIs), and any
              content, documentation, or materials made available in connection with the foregoing (collectively, the
              &ldquo;<strong>Platform</strong>&rdquo;).
            </p>
            <p>
              By: (a) accessing the Website; (b) using the Platform; (c) connecting a digital wallet to the Platform;
              and/or (d) executing any transaction through the Platform, you acknowledge that you have read, understood,
              and agree to be bound by these Terms. If you do not agree to these Terms, you must not access or use the
              Platform.
            </p>
            <p className="text-muted-foreground">
              Please review these Terms carefully. They contain important information regarding your legal rights,
              remedies, and obligations, including, but not limited to, various limitations, exclusions, and
              indemnification obligations.
            </p>
          </div>

          <Separator />

          {/* ─── 1. DEFINITIONS ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">1. Definitions</Text>
            <p>
              For purposes of these Terms, the following definitions apply:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                <strong>&ldquo;Escrow Contract&rdquo;</strong> means the immutable smart contract deployed on a supported
                blockchain network that holds digital assets in escrow pending the completion or dispute resolution of a
                Trade.
              </li>
              <li>
                <strong>&ldquo;Intellectual Property&rdquo;</strong> means all patents, copyrights, moral rights,
                trademarks, trade secrets, know-how, database rights, design rights, and any other intellectual property
                rights, whether registered or unregistered, and all applications and rights to apply for any of the
                foregoing, anywhere in the world.
              </li>
              <li>
                <strong>&ldquo;Prohibited Jurisdiction&rdquo;</strong> means any jurisdiction that is (a) subject to
                comprehensive economic sanctions administered by the United Nations, the European Union, the United
                States Office of Foreign Assets Control (OFAC), or any other applicable sanctions authority; or (b) a
                jurisdiction identified by the Financial Action Task Force (FATF) as a high-risk or non-cooperative
                jurisdiction.
              </li>
              <li>
                <strong>&ldquo;Prohibited Person&rdquo;</strong> means any person who is (a) a citizen, resident
                (tax or otherwise), or incorporated in a Prohibited Jurisdiction; (b) designated on any list of
                restricted or sanctioned parties maintained by a governmental authority, including but not limited to
                the OFAC Specially Designated Nationals and Blocked Persons List, the United Nations Consolidated
                Sanctions List, or any similar list; (c) otherwise prohibited by applicable law from accessing or using
                the Platform; or (d) under the age of eighteen (18) years.
              </li>
              <li>
                <strong>&ldquo;Supported Blockchain&rdquo;</strong> means any blockchain network on which the Platform
                has been deployed and is operational, including but not limited to Ethereum mainnet and test networks.
              </li>
              <li>
                <strong>&ldquo;Trade&rdquo;</strong> means any peer-to-peer transaction initiated through the Platform
                in which a buyer and seller agree to exchange digital assets for fiat currency or other digital assets,
                with the digital assets held in an Escrow Contract pending completion.
              </li>
              <li>
                <strong>&ldquo;User Content&rdquo;</strong> means any content, information, messages, offers, reviews,
                or materials that a User uploads, posts, submits, or otherwise makes available through the Platform.
              </li>
              <li>
                <strong>&ldquo;Wallet&rdquo;</strong> means a non-custodial cryptographic wallet used by a User to
                interact with the Platform and hold digital assets, the private keys to which are controlled solely by
                the User.
              </li>
            </ul>
          </div>

          <Separator />

          {/* ─── 2. ELIGIBILITY ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">2. Eligibility</Text>
            <p>
              To access or use the Platform, you represent and warrant that:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>you are at least eighteen (18) years of age;</li>
              <li>you have the full right, power, and authority to enter into and comply with these Terms;</li>
              <li>you are not a Prohibited Person and are not accessing or using the Platform from a Prohibited Jurisdiction;</li>
              <li>you have not been previously suspended or removed from the Platform;</li>
              <li>your access to and use of the Platform will comply with all applicable laws and regulations applicable to you; and</li>
              <li>
                you possess sufficient knowledge and experience in financial and technical matters to evaluate the
                risks associated with the Platform and the digital assets involved in any Trade.
              </li>
            </ul>
            <p>
              The Company reserves the right to restrict or prohibit access to the Platform by any person at any time
              and for any reason, at its sole discretion.
            </p>
          </div>

          <Separator />

          {/* ─── 3. SERVICES DESCRIPTION ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">3. Description of Services</Text>
            <p>
              The Platform provides a non-custodial peer-to-peer marketplace that enables Users to create, browse, and
              accept offers to trade digital assets. The Platform operates as follows:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                <strong>Offer Creation.</strong> A User may create a buy or sell offer specifying the digital asset,
                amount, desired exchange rate, accepted payment methods, and any additional terms.
              </li>
              <li>
                <strong>Offer Acceptance.</strong> A counter-party may accept an offer, at which point the Platform
                initiates an Escrow Contract on the applicable Supported Blockchain.
              </li>
              <li>
                <strong>Escrow.</strong> Upon acceptance, the seller&apos;s digital assets are deposited into the
                Escrow Contract. The assets remain locked in the Escrow Contract until: (a) both parties confirm
                completion of the off-chain settlement; or (b) a dispute is resolved in accordance with Section 9.
              </li>
              <li>
                <strong>Completion.</strong> Upon mutual confirmation, the Escrow Contract automatically releases the
                digital assets to the buyer and records the trade completion on-chain.
              </li>
              <li>
                <strong>Dispute Resolution.</strong> If either party initiates a dispute, the Platform&apos;s dispute
                resolution mechanism will be activated as described in Section 9.
              </li>
            </ul>
            <p>
              <strong>The Company is not a party to any Trade.</strong> The Company does not act as a broker, dealer,
              custodian, agent, or fiduciary for any User. The Company does not take possession, custody, or control of
              any digital assets at any time. All Trades are executed directly between Users through the Escrow Contract.
            </p>
          </div>

          <Separator />

          {/* ─── 4. NON-CUSTODIAL NATURE ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">4. Non-Custodial Architecture</Text>
            <p>
              The Platform is designed as a non-custodial system. This means:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                <strong>Private Key Responsibility.</strong> You are solely responsible for the custody and security of
                the private keys associated with your Wallet. The Company never has access to, stores, or controls your
                private keys or seed phrase.
              </li>
              <li>
                <strong>Self-Sovereign Control.</strong> You retain full custody and control of your digital assets at
                all times. Digital assets are transferred to and from the Escrow Contract exclusively through
                cryptographic signatures provided by you.
              </li>
              <li>
                <strong>No Custodial Relationship.</strong> Nothing in these Terms shall be construed as creating a
                custodial relationship between you and the Company. The Company has no ability to access, transfer,
                freeze, or recover the contents of your Wallet.
              </li>
              <li>
                <strong>Irreversibility.</strong> Blockchain transactions, once confirmed on the applicable blockchain
                network, are generally irreversible. You are solely responsible for verifying the accuracy of all
                transactions before signing and broadcasting them.
              </li>
            </ul>
          </div>

          <Separator />

          {/* ─── 5. USER OBLIGATIONS ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">5. User Obligations</Text>
            <p>
              By accessing or using the Platform, you agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                provide accurate, current, and complete information when creating an offer or engaging in a Trade;
              </li>
              <li>
                honour the terms of any offer you create or accept, including completing off-chain settlement within the
                timeframe specified in the Escrow Contract;
              </li>
              <li>
                promptly confirm or dispute the completion of a Trade once the off-chain settlement has been made;
              </li>
              <li>
                maintain the security of your Wallet, including never sharing your private keys, seed phrase, or
                Wallet credentials with any third party;
              </li>
              <li>
                comply with all applicable laws, rules, and regulations in your jurisdiction, including but not limited
                to tax reporting obligations and anti-money laundering requirements;
              </li>
              <li>
                promptly notify the Company of any unauthorized use of your Wallet or any security breach affecting the
                Platform;
              </li>
              <li>
                cooperate in good faith with any dispute resolution process initiated in connection with a Trade in which
                you are a party; and
              </li>
              <li>
                bear all costs associated with blockchain transactions, including but not limited to gas fees, network
                fees, and any other transaction-related costs.
              </li>
            </ul>
          </div>

          <Separator />

          {/* ─── 6. PROHIBITED ACTIVITIES ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">6. Prohibited Activities</Text>
            <p>
              You shall not, directly or indirectly, engage in or facilitate any of the following prohibited
              activities:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                use the Platform in violation of any applicable law, rule, or regulation, including but not limited to
                anti-money laundering (AML), counter-terrorism financing (CTF), and sanctions laws;
              </li>
              <li>
                use the Platform to engage in, facilitate, or promote money laundering, terrorist financing, sanctions
                evasion, or any other financial crime;
              </li>
              <li>
                access or use the Platform from a Prohibited Jurisdiction, or use a virtual private network (VPN),
                proxy, or any other method to circumvent geographic access restrictions;
              </li>
              <li>
                create or accept offers involving digital assets that you know or reasonably suspect to be stolen,
                fraudulently obtained, or otherwise illegally acquired;
              </li>
              <li>
                engage in market manipulation, including but not limited to wash trading, spoofing, front-running,
                or any other manipulative or deceptive trading practice;
              </li>
              <li>
                exploit software vulnerabilities, smart contract bugs, or any other technical flaw in the Platform
                for personal gain or to the detriment of other Users;
              </li>
              <li>
                use automated scripts, bots, scrapers, or any other automated means to access or interact with the
                Platform, except as expressly permitted by the Company;
              </li>
              <li>
                impersonate any person or entity, or falsely state or otherwise misrepresent your affiliation with
                any person or entity;
              </li>
              <li>
                upload, post, or transmit User Content that is unlawful, harmful, threatening, abusive, harassing,
                defamatory, vulgar, obscene, or otherwise objectionable;
              </li>
              <li>
                interfere with, disrupt, or impose an unreasonable burden on the Platform, servers, or networks
                connected to the Platform;
              </li>
              <li>
                attempt to gain unauthorized access to any portion of the Platform, other Users&apos; accounts, or
                any systems or networks connected to the Platform;
              </li>
              <li>
                reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code, algorithms,
                or underlying structure of any smart contract or software component of the Platform;
              </li>
              <li>
                remove, alter, or obscure any copyright, trademark, or other proprietary rights notice displayed
                on or in connection with the Platform; or
              </li>
              <li>
                use the Platform for the purpose of creating a competing product or service, or for benchmarking
                or competitive analysis purposes.
              </li>
            </ul>
          </div>

          <Separator />

          {/* ─── 7. FEES AND COSTS ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">7. Fees and Transaction Costs</Text>
            <p>
              The Company may charge fees for certain services provided through the Platform. All applicable fees
              will be disclosed prior to the execution of the relevant transaction. You acknowledge and agree to the
              following:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                <strong>Platform Fees.</strong> The Company reserves the right to charge platform fees, service fees,
                or commissions in connection with Trades executed through the Platform. Fee schedules may be updated
                from time to time, and the applicable fee schedule in effect at the time of a Trade shall apply.
              </li>
              <li>
                <strong>Gas Fees.</strong> All blockchain transactions require the payment of network transaction
                fees (&ldquo;Gas Fees&rdquo;) to the applicable blockchain network validators. Gas Fees are paid
                directly to the network and are not collected by the Company. Gas Fees are non-refundable.
              </li>
              <li>
                <strong>Third-Party Costs.</strong> You may incur additional costs from third-party service providers,
                including wallet providers, payment processors, or network bridge operators. Such costs are your sole
                responsibility.
              </li>
              <li>
                <strong>Tax Obligations.</strong> You are solely responsible for determining and paying any taxes
                applicable to your use of the Platform and your participation in Trades, including but not limited to
                income tax, capital gains tax, value-added tax, goods and services tax, sales tax, and any other
                applicable taxes. The Company does not provide tax advice and is not responsible for collecting,
                reporting, remitting, or withholding any taxes on your behalf.
              </li>
            </ul>
          </div>

          <Separator />

          {/* ─── 8. RISK DISCLOSURE ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">8. Risk Disclosure</Text>
            <p>
              Your use of the Platform and participation in Trades involves significant risks. You acknowledge and
              agree to assume all risks associated with the Platform, including but not limited to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                <strong>Smart Contract Risk.</strong> Escrow Contracts are deployed on public blockchains and may
                contain bugs, vulnerabilities, or design flaws. Despite audits and security reviews, there is no
                guarantee that smart contracts are free from defects. Exploits or vulnerabilities in smart contracts
                may result in the loss of some or all of your digital assets.
              </li>
              <li>
                <strong>Blockchain Network Risk.</strong> The Supported Blockchains may experience congestion, forks,
                reorganizations, or other technical issues that could affect the execution, timing, or finality of
                transactions.
              </li>
              <li>
                <strong>Counter-Party Risk.</strong> Trades are conducted directly between Users. The Company does
                not guarantee the identity, solvency, or performance of any counter-party. A counter-party may fail
                to complete a Trade, provide fraudulent payment, or engage in other harmful conduct.
              </li>
              <li>
                <strong>Price Volatility.</strong> Digital assets are highly volatile and may experience significant
                price fluctuations. The value of digital assets held in an Escrow Contract may change materially
                between the initiation and completion of a Trade.
              </li>
              <li>
                <strong>Regulatory Risk.</strong> The legal and regulatory status of digital assets, blockchain
                technology, and decentralized protocols is uncertain and may change. Regulatory actions or changes
                in law may adversely affect the Platform or your ability to use it.
              </li>
              <li>
                <strong>Operational Risk.</strong> The Platform may be disrupted, suspended, or terminated due to
                technical failures, maintenance, cyberattacks, or other events beyond the Company&apos;s control.
              </li>
              <li>
                <strong>Liquidity Risk.</strong> There may be limited liquidity for certain digital assets, which
                could affect your ability to execute Trades at desired prices.
              </li>
              <li>
                <strong>Bridge and Cross-Chain Risk.</strong> If the Platform supports assets on multiple blockchains,
                cross-chain bridging infrastructure may be subject to exploits, delays, or failures that could result
                in loss of funds.
              </li>
              <li>
                <strong>Irreversibility.</strong> Blockchain transactions are generally irreversible. Once a
                transaction is confirmed on the blockchain, it cannot be reversed by the Company or any other party.
              </li>
              <li>
                <strong>Private Key Loss.</strong> If you lose access to your Wallet (e.g., by losing your private
                keys or seed phrase), you will permanently lose access to any digital assets held in that Wallet,
                including any digital assets held in an Escrow Contract pending a Trade.
              </li>
            </ul>
            <p className="text-muted-foreground font-medium">
              THE COMPANY STRONGLY RECOMMENDS THAT YOU CONSULT WITH A QUALIFIED LEGAL, FINANCIAL, OR TAX PROFESSIONAL
              BEFORE USING THE PLATFORM OR PARTICIPATING IN ANY TRADES.
            </p>
          </div>

          <Separator />

          {/* ─── 9. DISPUTE RESOLUTION ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">9. Dispute Resolution</Text>
            <p>
              <strong>9.1 On-Platform Disputes.</strong> If a dispute arises between the parties to a Trade, either
              party may initiate a dispute through the Platform. The dispute resolution process is as follows:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                <strong>Filing.</strong> The initiating party must file a dispute within the timeframe specified in the
                Escrow Contract, providing supporting evidence of the alleged breach or non-performance.
              </li>
              <li>
                <strong>Response.</strong> The counter-party will be notified and given an opportunity to respond with
                their own evidence within the timeframe specified by the Platform.
              </li>
              <li>
                <strong>Resolution.</strong> The Platform will review the evidence submitted by both parties and issue
                a binding resolution, which will be executed by the Escrow Contract. The resolution may result in the
                release of digital assets to either party, in whole or in part.
              </li>
            </ul>
            <p>
              <strong>9.2 Binding Arbitration.</strong> Any dispute, controversy, or claim arising out of or relating
              to these Terms, or the breach, termination, or invalidity thereof, that cannot be resolved through the
              Platform&apos;s on-platform dispute resolution process, shall be finally resolved by binding arbitration
              under the rules of the American Arbitration Association (AAA). The arbitration shall be conducted in
              English and held in a mutually agreed-upon location, or remotely if the parties cannot agree on a
              physical location. The arbitrator&apos;s decision shall be final and binding, and judgment upon the
              award may be entered in any court of competent jurisdiction.
            </p>
            <p>
              <strong>9.3 Class Action Waiver.</strong> To the maximum extent permitted by applicable law, you agree
              that any dispute resolution proceedings will be conducted only on an individual basis and not in a
              class, consolidated, or representative action. You waive any right to participate in a class action
              lawsuit or class-wide arbitration against the Company.
            </p>
            <p>
              <strong>9.4 Exceptions.</strong> Notwithstanding the foregoing, either party may seek injunctive or
              other equitable relief in any court of competent jurisdiction to prevent the actual or threatened
              infringement, misappropriation, or violation of Intellectual Property rights or confidential
              information.
            </p>
          </div>

          <Separator />

          {/* ─── 10. DISCLAIMERS ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">10. Disclaimers</Text>
            <p className="uppercase font-semibold text-foreground">
              THE PLATFORM IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT
              WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES
              OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, AND ACCURACY.
            </p>
            <p>
              Without limiting the foregoing, the Company does not warrant that:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>the Platform will meet your specific requirements or expectations;</li>
              <li>
                the Platform will be available on an uninterrupted, timely, secure, or error-free basis;
              </li>
              <li>
                the results obtained from the use of the Platform will be accurate, reliable, or complete;
              </li>
              <li>
                any defects or errors in the Platform will be corrected; or
              </li>
              <li>
                the Platform or the servers that make it available are free of viruses, malware, or other harmful
                components.
              </li>
            </ul>
            <p>
              The Company is not responsible for the conduct of any User, counter-party, or third party. The Company
              does not endorse, guarantee, or assume responsibility for any offers, trades, or transactions made
              through the Platform. You are solely responsible for your interactions with other Users and for
              verifying the accuracy and completeness of all information before entering into any Trade.
            </p>
            <p>
              No advice or information, whether oral or written, obtained from the Company or through the Platform
              shall create any warranty not expressly made in these Terms.
            </p>
          </div>

          <Separator />

          {/* ─── 11. LIMITATION OF LIABILITY ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">11. Limitation of Liability</Text>
            <p className="uppercase font-semibold text-foreground">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE COMPANY, ITS AFFILIATES,
              DIRECTORS, OFFICERS, EMPLOYEES, AGENTS, OR SERVICE PROVIDERS BE LIABLE TO YOU OR ANY THIRD PARTY FOR
              ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING, BUT NOT
              LIMITED TO, DAMAGES FOR LOSS OF PROFITS, GOODWILL, DATA, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF
              OR IN CONNECTION WITH:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>your access to, use of, or inability to access or use the Platform;</li>
              <li>any conduct or content of any third party on or through the Platform;</li>
              <li>any content obtained from or through the Platform;</li>
              <li>unauthorized access, use, or alteration of your transmissions, content, or data;</li>
              <li>any Trades, disputes, or resolution outcomes involving your use of the Platform; or</li>
              <li>
                any bugs, vulnerabilities, exploits, or other defects in the Platform or any smart contracts
                deployed in connection with the Platform.
              </li>
            </ul>
            <p>
              In no event shall the Company&apos;s aggregate liability to you for all claims arising out of or
              relating to these Terms or the Platform exceed the greater of (a) the amount of fees paid by you to the
              Company in the twelve (12) months immediately preceding the event giving rise to the claim, or (b) one
              hundred U.S. dollars (USD 100.00).
            </p>
            <p>
              The limitations of liability set forth above are fundamental elements of the basis of the bargain between
              the Company and you. The Platform would not be provided to you without such limitations.
            </p>
          </div>

          <Separator />

          {/* ─── 12. INDEMNIFICATION ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">12. Indemnification</Text>
            <p>
              You agree to indemnify, defend, and hold harmless the Company and its affiliates, directors, officers,
              employees, agents, contractors, licensors, and service providers (collectively, the
              &ldquo;<strong>Indemnified Parties</strong>&rdquo;) from and against any and all claims, damages,
              obligations, losses, liabilities, costs, and expenses (including reasonable attorneys&apos; fees and
              costs) arising from or relating to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>your access to or use of the Platform;</li>
              <li>your violation of these Terms;</li>
              <li>your violation of any applicable law, rule, or regulation;</li>
              <li>
                your violation of any third-party right, including any intellectual property, privacy, or
                proprietary right;
              </li>
              <li>
                any User Content you submit, post, or transmit through the Platform; or
              </li>
              <li>
                any dispute or transaction between you and any other User or third party.
              </li>
            </ul>
            <p>
              The Company reserves the right, at your expense, to assume the exclusive defence and control of any
              matter subject to indemnification by you, in which event you shall cooperate fully with the Company in
              asserting any available defences.
            </p>
          </div>

          <Separator />

          {/* ─── 13. INTELLECTUAL PROPERTY ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">13. Intellectual Property</Text>
            <p>
              All Intellectual Property rights in and to the Platform, including but not limited to the Website, its
              design, code, documentation, logos, trademarks, and all associated content and materials, are and shall
              remain the exclusive property of the Company or its licensors. Subject to your compliance with these
              Terms, the Company grants you a limited, non-exclusive, non-transferable, revocable licence to access
              and use the Platform solely for your personal, non-commercial use.
            </p>
            <p>
              You shall not:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>copy, modify, distribute, sell, or lease any part of the Platform;</li>
              <li>reverse engineer or attempt to extract the source code of any component of the Platform;</li>
              <li>remove, alter, or obscure any proprietary notices or labels on the Platform; or</li>
              <li>
                use the Company&apos;s name, logos, trademarks, or other branding materials without the
                Company&apos;s prior written consent.
              </li>
            </ul>
            <p>
              By submitting User Content to the Platform, you grant the Company a worldwide, non-exclusive,
              royalty-free, sublicensable, and transferable licence to use, reproduce, modify, adapt, publish,
              translate, create derivative works from, and display such User Content in connection with the operation
              and promotion of the Platform.
            </p>
          </div>

          <Separator />

          {/* ─── 14. PRIVACY ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">14. Privacy and Data Protection</Text>
            <p>
              Your privacy is important to us. Our collection, use, and disclosure of your personal information is
              governed by our Privacy Policy, which is incorporated into these Terms by reference. By using the
              Platform, you consent to the collection, use, and disclosure of your information as described in the
              Privacy Policy.
            </p>
            <p>
              The Platform is designed to minimize the collection of personal data. However, certain information may
              be automatically collected when you access or use the Platform, including but not limited to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>your public wallet address;</li>
              <li>transaction data recorded on the blockchain;</li>
              <li>IP address and browser information; and</li>
              <li>usage data and analytics related to your interaction with the Platform.</li>
            </ul>
            <p>
              You acknowledge that blockchain transactions are public by nature and that your wallet address and
              transaction history may be visible to others.
            </p>
          </div>

          <Separator />

          {/* ─── 15. TERMINATION ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">15. Termination and Suspension</Text>
            <p>
              The Company may, at its sole discretion, restrict, suspend, or terminate your access to or use of the
              Platform, in whole or in part, at any time and for any reason, including but not limited to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>violation of these Terms;</li>
              <li>engagement in Prohibited Activities;</li>
              <li>requests from law enforcement or other government agencies;</li>
              <li>unexpected technical or security issues; or</li>
              <li>extended periods of inactivity.</li>
            </ul>
            <p>
              Upon termination, your right to use the Platform ceases immediately. Any Trades in progress at the
              time of termination shall be handled in accordance with the applicable Escrow Contract terms. The Company
              shall not be liable to you or any third party for any termination of your access to the Platform.
            </p>
            <p>
              The following sections shall survive termination of these Terms: Definitions, Disclaimers, Limitation
              of Liability, Indemnification, Intellectual Property, Dispute Resolution, Governing Law, and any
              other provisions that by their nature should survive.
            </p>
          </div>

          <Separator />

          {/* ─── 16. GOVERNING LAW ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">16. Governing Law</Text>
            <p>
              These Terms and any dispute arising out of or in connection with these Terms or the Platform shall be
              governed by and construed in accordance with the laws of the Republic of Panama, without regard to its
              conflict of laws principles. Any legal action or proceeding arising out of or relating to these Terms
              shall be brought exclusively in the courts of the Republic of Panama, and you irrevocably consent to
              the personal jurisdiction and venue of such courts.
            </p>
          </div>

          <Separator />

          {/* ─── 17. MODIFICATIONS ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">17. Modifications to Terms</Text>
            <p>
              The Company reserves the right to modify, amend, or update these Terms at any time and at its sole
              discretion. Any material changes will be communicated through the Platform or by other reasonable means.
              The &ldquo;Date Last Revised&rdquo; at the top of these Terms indicates when they were last updated.
            </p>
            <p>
              Your continued access to or use of the Platform following the posting of revised Terms constitutes your
              acceptance of and agreement to be bound by the revised Terms. If you do not agree to the revised Terms,
              you must immediately cease using the Platform.
            </p>
          </div>

          <Separator />

          {/* ─── 18. MISCELLANEOUS ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">18. Miscellaneous</Text>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                <strong>Entire Agreement.</strong> These Terms, together with the Privacy Policy and any other
                legal notices or policies published by the Company on the Platform, constitute the entire agreement
                between you and the Company with respect to the subject matter hereof, and supersede all prior and
                contemporaneous agreements, understandings, negotiations, and discussions, whether oral or written,
                between you and the Company.
              </li>
              <li>
                <strong>Severability.</strong> If any provision of these Terms is held to be invalid, illegal, or
                unenforceable under applicable law, such provision shall be modified to the minimum extent necessary
                to make it valid, legal, and enforceable, and the validity, legality, and enforceability of the
                remaining provisions shall not in any way be affected or impaired thereby.
              </li>
              <li>
                <strong>Waiver.</strong> The failure of the Company to exercise or enforce any right or provision of
                these Terms shall not constitute a waiver of such right or provision. No waiver of any term shall be
                deemed a further or continuing waiver of such term or any other term.
              </li>
              <li>
                <strong>Assignment.</strong> You may not assign or transfer these Terms, by operation of law or
                otherwise, without the Company&apos;s prior written consent. The Company may assign or transfer these
                Terms, in whole or in part, without restriction. Subject to the foregoing, these Terms shall bind
                and inure to the benefit of the parties, their successors, and permitted assigns.
              </li>
              <li>
                <strong>Force Majeure.</strong> The Company shall not be liable for any failure or delay in
                performance of its obligations under these Terms arising out of or caused by circumstances beyond
                its reasonable control, including but not limited to acts of God, natural disasters, war, terrorism,
                riots, embargoes, acts of civil or military authorities, fire, floods, accidents, pandemics,
                strikes, or shortages of transportation, facilities, fuel, energy, labour, or materials.
              </li>
              <li>
                <strong>Notices.</strong> The Company may provide notices to you through the Platform, by email, or
                by any other means reasonably calculated to reach you. Such notices shall be deemed received upon
                the earlier of actual receipt, posting on the Platform, or delivery to your email address.
              </li>
              <li>
                <strong>No Third-Party Beneficiaries.</strong> These Terms do not confer any rights or remedies
                upon any person or entity other than the parties hereto, except as expressly stated herein.
              </li>
              <li>
                <strong>Language.</strong> These Terms are drafted in the English language. In the event of any
                conflict between the English version and any translation, the English version shall prevail.
              </li>
            </ul>
          </div>

          <Separator />

          {/* ─── CONTACT ─── */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">Contact Us</Text>
            <p>
              If you have any questions about these Terms, please contact us at:{' '}
              <span className="text-primary font-medium">legal@coffernode.com</span>.
            </p>
          </div>

        </div>
      </Card>
    </section>
  )
}
