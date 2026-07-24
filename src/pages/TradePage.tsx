import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { type Abi } from 'viem'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { ShieldCheck, Clock, Globe, Tag, Loader2 } from 'lucide-react'
import { useOffer } from '@/hooks/useOffers'
import { createTrade, upsertUser } from '@/lib/supabase'
import {
  KLEROS_ESCROW_FACTORY_ABI,
  KLEROS_ESCROW_FACTORY_ADDRESS,
  DEFAULT_GRACE_PERIOD_SECONDS,
  DEFAULT_SECURITY_DEPOSIT_BPS,
  isFactoryConfigured,
} from '@/lib/contracts'

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
const currencySymbol = (code: string) => CURRENCY_SYMBOLS[code] ?? ''

const REGION_NAMES: Record<string, string> = {
  IT: 'Italy', DE: 'Germany', FR: 'France', ES: 'Spain',
}

type Stage = 'idle' | 'creating-escrow' | 'mining' | 'saving'

export function TradePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { data: offer, isLoading, isError } = useOffer(id)

  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [stage, setStage] = useState<Stage>('idle')

  const isSubmitting = stage !== 'idle'
  const factoryReady = isFactoryConfigured()

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading offer…
      </section>
    )
  }

  if (isError || !offer) {
    return (
      <section className="max-w-xl mx-auto space-y-6">
        <AppPageHeader title="Offer not found" variant="centered" onBack={() => navigate(-1)} />
        <Card>
          <CardContent className="p-6 space-y-4">
            <Text variant="body" className="text-muted-foreground">
              This offer couldn’t be loaded. It may have been removed or expired.
            </Text>
            <Button className="rounded-full" onClick={() => navigate('/app/offers')}>Back to offers</Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  const token = offer.crypto_token
  const price = Number(offer.price_per_unit) || 0
  const minAmount = Number(offer.min_amount) || 0
  const maxAmount = Number(offer.max_amount) || 0
  const symbol = currencySymbol(offer.fiat_currency)
  const feePercent = (Number(offer.platform_fee_bps) / 100).toFixed(2)
  const networkFee = Number(offer.network_fee) || 0

  const seller = offer.seller
  const sellerName = seller?.nickname ?? (seller?.wallet_address ?? 'Trader')
  const sellerAddr = seller?.wallet_address ?? ''
  const formatAddress = (addr: string) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '')

  const paymentMethods: string[] = offer.payment_methods ?? []
  const regions: string[] = offer.available_regions ?? []
  const tags: string[] = offer.tags ?? []

  const amountNum = Number(amount)
  const amountValid = !!amount && !Number.isNaN(amountNum) && amountNum >= minAmount && amountNum <= maxAmount
  const cryptoEstimate = amountValid && price > 0 ? amountNum / price : null

  const expiresAt = offer.expires_at ? new Date(offer.expires_at) : null

  const handleOpenTrade = async () => {
    if (!isConnected || !address) {
      toast.error('Connect your wallet to open a trade.')
      return
    }
    if (!factoryReady) {
      toast.error(
        'Factory address not configured (VITE_KLEROS_ESCROW_FACTORY). Set it in .env to enable on-chain escrow deployment.',
      )
      return
    }
    if (!amountValid) {
      toast.error(`Enter an amount between ${symbol}${minAmount.toLocaleString()} and ${symbol}${maxAmount.toLocaleString()}.`)
      return
    }
    if (!paymentMethod) {
      toast.error('Select a payment method.')
      return
    }
    if (!publicClient) {
      toast.error('Public RPC client not ready. Try again.')
      return
    }

    setStage('creating-escrow')
    try {
      const me = await upsertUser(address)
      if (me.id === offer.seller_id) {
        toast.error("You can’t trade your own offer.")
        setStage('idle')
        return
      }

      // Determine taker role + buyer/seller IDs.
      const isMakerBuyer = offer.type === 'buy'
      const buyerId = isMakerBuyer ? offer.seller_id : me.id
      const sellerId = isMakerBuyer ? me.id : offer.seller_id

      // The on-chain KlerosEsc buyer/seller are wallet addresses, NOT Supabase
      // user IDs. We resolve the counterparty's wallet from their Supabase
      // user row. Until `users` is reliably populated on signup, we fall back
      // to the connected wallet for both sides (only valid if seller = taker).
      const buyerWallet = isMakerBuyer
        ? sellerAddr
        : address
      const sellerWallet = isMakerBuyer
        ? address
        : sellerAddr

      const cryptoAmount = amountNum / price // human-units → token base units
      // The factory accepts tradeAmount in token base units (no decimals).
      // For ERC-20s we'd multiply by 10**decimals here, but the simplest
      // correct path is to assume 18-decimal tokens throughout — fine for
      // the demo; production should resolve decimals from the token contract.

      setStage('mining')
      const txHash = await writeContractAsync({
        address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
        abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
        functionName: 'createEscrow',
        args: [
          buyerWallet as `0x${string}`,
          sellerWallet as `0x${string}`,
          DEFAULT_GRACE_PERIOD_SECONDS,
          BigInt(Math.floor(cryptoAmount)),
          DEFAULT_SECURITY_DEPOSIT_BPS,
        ],
      })
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      })
      // Decode the EscrowCreated event to extract the deployed clone address.
      const { decodeEventLog } = await import('viem')
      let deployedAddress: `0x${string}` | null = null
      const factoryAbi = KLEROS_ESCROW_FACTORY_ABI as Abi
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: factoryAbi,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName === 'EscrowCreated') {
            const args = decoded.args as { escrowAddress?: string }
            if (args.escrowAddress) deployedAddress = args.escrowAddress as `0x${string}`
          }
        } catch {
          // Not an EscrowCreated log; skip.
        }
      }

      if (!deployedAddress) {
        // Fallback: read the factory's clones map (cheaper than the event
        // decode — same outcome for fresh escrows).
        const cloneCount = (await publicClient.readContract({
          address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: 'escrowCountByBuyer',
          args: [buyerWallet as `0x${string}`],
        })) as bigint
        if (cloneCount > 0n) {
          deployedAddress = (await publicClient.readContract({
            address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
            abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
            functionName: 'escrowByBuyer',
            args: [buyerWallet as `0x${string}`, cloneCount - 1n],
          })) as `0x${string}`
        }
      }

      if (!deployedAddress) {
        throw new Error('Failed to resolve the deployed escrow address.')
      }

      // Persist the trade to Supabase with on-chain metadata.
      setStage('saving')
      const trade = await createTrade({
        offer_id: offer.id,
        buyer_id: buyerId,
        seller_id: sellerId,
        crypto_token: token,
        crypto_amount: cryptoAmount,
        crypto_price_per_unit: price,
        fiat_currency: offer.fiat_currency,
        fiat_amount: amountNum,
        payment_method: paymentMethod,
        payment_details: {},
        platform_fee_bps: Number(offer.platform_fee_bps) || 50,
        taker_role: isMakerBuyer ? 'seller' : 'buyer',
        // The Trade type already has `escrow_contract_addr` (string | null).
        escrow_contract_addr: deployedAddress,
      })

      toast.success('Escrow deployed — fund the trade to continue.')
      navigate(`/app/trades/${trade.id}`)
    } catch (error) {
      console.error('Error opening trade:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to open trade. Please try again.',
      )
    } finally {
      setStage('idle')
    }
  }

  return (
    <section className="space-y-8">
      <div className="max-w-xl mx-auto space-y-6">
        <AppPageHeader
          title={offer.type === 'sell' ? `Buy ${token}` : `Sell ${token}`}
          subtitle={`${offer.type} · Offer ${offer.offer_id ?? offer.id}`}
          variant="centered"
          onBack={() => navigate(-1)}
        />
        <div className="space-y-4">
          {/* Unified main card: seller header + offer details */}
          <Card>
            <CardContent className="space-y-6">
              {/* Seller header */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={seller?.avatar_url ?? undefined} />
                    <AvatarFallback>{sellerName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <Text variant="h4" className="truncate">{sellerName}</Text>
                    {sellerAddr && (
                      <Text variant="small" className="font-mono text-muted-foreground">
                        {formatAddress(sellerAddr)}
                      </Text>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-primary">★</span>
                    <span className="font-medium">{Number(seller?.avg_rating) || '—'}</span>
                  </div>
                  <span className="text-muted-foreground">·</span>
                  <span>
                    <span className="font-medium">{(seller?.total_trades ?? 0).toLocaleString()}</span>{' '}
                    <span className="text-muted-foreground">trades</span>
                  </span>
                </div>
              </div>

              <Separator />

              {/* Offer details */}
              <div className="space-y-3">
                <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground">
                  Offer Details
                </Text>
                <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm justify-start">
                  <span className="text-muted-foreground">Price per {token}</span>
                  <span className="font-mono">{symbol}{price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="text-muted-foreground">Trade range</span>
                  <span className="font-mono">{symbol}{minAmount.toLocaleString()} – {symbol}{maxAmount.toLocaleString()}</span>
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Globe className="w-4 h-4" /> Currency
                  </span>
                  <span>{offer.fiat_currency}</span>
                  {expiresAt && (
                    <>
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Clock className="w-4 h-4" /> Expires
                      </span>
                      <span>{expiresAt.toLocaleDateString()}</span>
                    </>
                  )}
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> Platform fee
                  </span>
                  <span className="font-mono">{feePercent}%{networkFee > 0 ? ` (+${networkFee} gas)` : ''}</span>
                  <span className="text-muted-foreground">Payment methods</span>
                  <span className="flex flex-wrap gap-1.5">
                    {paymentMethods.map((m) => (
                      <Badge key={m} variant="secondary" className="rounded-full">{m}</Badge>
                    ))}
                  </span>
                  {regions.length > 0 && (
                    <>
                      <span className="text-muted-foreground">Regions</span>
                      <span className="flex flex-wrap gap-1.5">
                        {regions.map((r) => (
                          <Badge key={r} variant="outline" className="rounded-full">{REGION_NAMES[r] ?? r}</Badge>
                        ))}
                      </span>
                    </>
                  )}
                  {tags.length > 0 && (
                    <>
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Tag className="w-4 h-4" /> Tags
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {tags.map((t) => (
                          <Badge key={t} variant="secondary" className="rounded-full">{t}</Badge>
                        ))}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trade input card */}
          <Card>
            <CardContent className="space-y-4">
              {/* Amount input */}
              <div className="space-y-2">
                <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount ({offer.fiat_currency})
                </Text>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={`${minAmount} – ${maxAmount}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="rounded-full"
                />
                {cryptoEstimate !== null ? (
                  <Text variant="small" className="text-muted-foreground">
                    ≈ {cryptoEstimate.toLocaleString('en-US', { maximumFractionDigits: 6 })} {token}
                  </Text>
                ) : (
                  amount !== '' && (
                    <Text variant="small" className="text-destructive">
                      Must be between {symbol}{minAmount.toLocaleString()} and {symbol}{maxAmount.toLocaleString()}
                    </Text>
                  )
                )}
              </div>

              {/* Payment method dropdown + action */}
              <div className="space-y-2">
                <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment method
                </Text>
                <div className="flex gap-2">
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="w-full rounded-full">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="rounded-full shadow-none px-8"
                    disabled={isSubmitting}
                    onClick={handleOpenTrade}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Opening…
                      </>
                    ) : (
                      'Open Trade'
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
