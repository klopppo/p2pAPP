import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import { createTrade, ensureUser } from '@/lib/supabase'
import {
  KLEROS_ESCROW_FACTORY_ABI,
  KLEROS_ESCROW_FACTORY_ADDRESS,
  ERC20_ABI,
  DEFAULT_GRACE_PERIOD_SECONDS,
  DEFAULT_SECURITY_DEPOSIT_BPS,
  isFactoryConfigured,
} from '@/lib/contracts'
import { parseUnits } from 'viem'
import { errorMessage } from '@/lib/errorMessage'

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
  const { t } = useTranslation()

  const [amount, setAmount] = useState('')
  const [depositRate, setDepositRate] = useState(
    String(Number(DEFAULT_SECURITY_DEPOSIT_BPS) / 100),
  )
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [stage, setStage] = useState<Stage>('idle')

  const isSubmitting = stage !== 'idle'
  const factoryReady = isFactoryConfigured()

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('trade.loadingOffer')}
      </section>
    )
  }

  if (isError || !offer) {
    return (
      <section className="max-w-xl mx-auto space-y-6">
        <AppPageHeader title={t('trade.offerNotFound')} variant="centered" onBack={() => navigate(-1)} />
        <Card>
          <CardContent className="space-y-4">
            <Text variant="body" className="text-muted-foreground">
              {t('trade.offerNotFoundDescription')}
            </Text>
            <Button className="rounded-full" onClick={() => navigate('/app/offers')}>{t('trade.backToOffers')}</Button>
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

  // Deposit rate in percent (0–15). On-chain it's bps; the contract accepts
  // exactly 0 or ≥ MIN_SECURITY_DEPOSIT_BPS (1%).
  const depositRateNum = Number(depositRate)
  const depositValid =
    !Number.isNaN(depositRateNum) &&
    depositRateNum >= 0 &&
    depositRateNum <= 15 &&
    (depositRateNum === 0 || depositRateNum >= 1)
  const depositBps =
    depositRateNum === 0 ? 0n : BigInt(Math.round(depositRateNum * 100))

  const expiresAt = offer.expires_at ? new Date(offer.expires_at) : null

  const handleOpenTrade = async () => {
    if (!isConnected || !address) {
      toast.error(t('trade.errorConnectWallet'))
      return
    }
    if (!factoryReady) {
      toast.error(
        t('trade.errorFactoryNotConfigured'),
      )
      return
    }
    if (!amountValid) {
      toast.error(t('trade.errorAmountRange', { min: `${symbol}${minAmount.toLocaleString()}`, max: `${symbol}${maxAmount.toLocaleString()}` }))
      return
    }
    if (!paymentMethod) {
      toast.error(t('trade.errorSelectPayment'))
      return
    }
    if (!depositValid) {
      toast.error(t('trade.errorDepositRate'))
      return
    }
    if (!publicClient) {
      toast.error(t('trade.errorRpcClient'))
      return
    }

    setStage('creating-escrow')
    try {
      const me = await ensureUser(address)
      if (me.id === offer.seller_id) {
        toast.error(t('trade.errorOwnOffer'))
        setStage('idle')
        return
      }

      // Determine taker role + buyer/seller IDs.
      const isMakerBuyer = offer.type === 'buy'
      const buyerId = isMakerBuyer ? offer.seller_id : me.id
      const sellerId = isMakerBuyer ? me.id : offer.seller_id

      // Resolve buyer/seller wallet addresses for the on-chain escrow. The
      // maker's wallet is on the offer row; the taker's wallet is the
      // connected address.
      const buyerWallet = isMakerBuyer ? sellerAddr : address
      const sellerWallet = isMakerBuyer ? address : sellerAddr

      const cryptoAmount = amountNum / price // human-units (e.g. 1.5 ETH)

      // Read the escrow token + its decimals so the on-chain amount is exact.
      // The factory pins a single token; the escrow holds tradeAmount in base
      // units (wei-equivalent). Without this, amounts < 1 token were floored
      // to 0 / integers and every trade under-collateralized the escrow.
      //
      // Also read the pinned treasury + Kleros court configuration in the
      // same round-trip so the server-side indexer / Trade list has the
      // immutable escrow fields without re-reading the chain per row (B-10).
      const factoryAddress = KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`
      const [
        tokenAddress,
        treasuryAddress,
        klerosCourtAddr,
        klerosPart1,
        klerosPart2,
      ] = (await Promise.all([
        publicClient.readContract({
          address: factoryAddress,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: 'token',
        }),
        publicClient.readContract({
          address: factoryAddress,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: 'treasury',
        }),
        publicClient.readContract({
          address: factoryAddress,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: 'klerosCourt',
        }),
        publicClient.readContract({
          address: factoryAddress,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: 'klerosExtraDataPart1',
        }),
        publicClient.readContract({
          address: factoryAddress,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: 'klerosExtraDataPart2',
        }),
      ])) as [
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
      ]
      const decimals = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI as Abi,
        functionName: 'decimals',
        args: [],
      })) as number
      const safeDecimals = Math.min(Math.max(decimals, 0), 18)
      const cryptoBaseUnits = parseUnits(
        cryptoAmount.toFixed(safeDecimals),
        safeDecimals,
      )

      // Deploy a KlerosEsc clone via the factory. Default grace period is
      // 7 days, default security deposit is 10% (within KlerosEsc's MIN/MAX).
      setStage('mining')
      const txHash = await writeContractAsync({
        address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
        abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
        functionName: 'createEscrow',
        args: [
          buyerWallet as `0x${string}`,
          sellerWallet as `0x${string}`,
          DEFAULT_GRACE_PERIOD_SECONDS,
          cryptoBaseUnits,
          depositBps,
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
            if (args.escrowAddress) {
              deployedAddress = args.escrowAddress as `0x${string}`
            }
          }
        } catch {
          // Not an EscrowCreated log; skip.
        }
      }

      if (!deployedAddress) {
        // Fallback: read the factory's clones map for the latest escrow
        // registered to the buyer (cheaper than waiting for indexers).
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
        throw new Error(t('trade.errorFailedToDeploy'))
      }

      // Persist the trade to Supabase with on-chain metadata. B-10: also write
      //   - treasury_address (fee recipient; was always NULL before)
//   - creator (msg.sender of createEscrow)
//   - kleros_court_addr + extraData parts (so the indexer / trades list can
//     skip the on-chain multicall for these immutable per-escrow fields)
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
        treasury_address: treasuryAddress,
        taker_role: isMakerBuyer ? 'seller' : 'buyer',
        // The Trade type already has `escrow_contract_addr` (string | null).
        escrow_contract_addr: deployedAddress,
        creator: address,
        kleros_court_addr: klerosCourtAddr,
        kleros_extra_data_part1: klerosPart1,
        kleros_extra_data_part2: klerosPart2,
      })

      toast.success(t('trade.successDeployed'))
      navigate(`/app/trades/${trade.id}`)
    } catch (error) {
      console.error('Error opening trade:', error)
      toast.error(errorMessage(error, 'trade', t, 'errorFailedToDeploy'))
    } finally {
      setStage('idle')
    }
  }

  return (
    <section className="space-y-8">
      <div className="max-w-xl mx-auto space-y-6">
        <AppPageHeader
          title={offer.type === 'sell' ? t('trade.buyToken', { token }) : t('trade.sellToken', { token })}
          subtitle={t('trade.offerSubtitle', { type: offer.type, offerId: offer.offer_id ?? offer.id })}
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
                  <Link to={`/app/profile/${sellerAddr}`}>
                    <Avatar className="h-12 w-12 hover:opacity-80 transition-opacity">
                      <AvatarImage src={seller?.avatar_url ?? undefined} />
                      <AvatarFallback>{sellerName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="min-w-0">
                    <Link to={`/app/profile/${sellerAddr}`}>
                      <Text variant="h4" className="truncate hover:underline">{sellerName}</Text>
                    </Link>
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
                  {t('trade.offerDetails')}
                </Text>
                <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm justify-start">
                  <span className="text-muted-foreground">{t('trade.pricePerToken', { token })}</span>
                  <span className="font-mono">{symbol}{price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="text-muted-foreground">{t('trade.tradeRange')}</span>
                  <span className="font-mono">{symbol}{minAmount.toLocaleString()} – {symbol}{maxAmount.toLocaleString()}</span>
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Globe className="w-4 h-4" /> {t('trade.currency')}
                  </span>
                  <span>{offer.fiat_currency}</span>
                  {expiresAt && (
                    <>
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Clock className="w-4 h-4" /> {t('trade.expires')}
                      </span>
                      <span>{expiresAt.toLocaleDateString()}</span>
                    </>
                  )}
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> {t('trade.platformFee')}
                  </span>
                  <span className="font-mono">{feePercent}%{networkFee > 0 ? ` (+${networkFee} gas)` : ''}</span>
                  <span className="text-muted-foreground">{t('trade.paymentMethods')}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {paymentMethods.map((m) => (
                      <Badge key={m} variant="secondary" className="rounded-full">{m}</Badge>
                    ))}
                  </span>
                  {regions.length > 0 && (
                    <>
                      <span className="text-muted-foreground">{t('trade.regions')}</span>
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
                        <Tag className="w-4 h-4" /> {t('trade.tags')}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="rounded-full">{tag}</Badge>
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
                  {t('trade.amountLabel', { currency: offer.fiat_currency })}
                </Text>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={t('trade.amountPlaceholder', { min: minAmount, max: maxAmount })}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="rounded-full"
                />
                {cryptoEstimate !== null ? (
                  <Text variant="small" className="text-muted-foreground">
                    {t('trade.cryptoEstimate', { amount: cryptoEstimate.toLocaleString('en-US', { maximumFractionDigits: 6 }), token })}
                  </Text>
                ) : (
                  amount !== '' && (
                    <Text variant="small" className="text-destructive">
                      {t('trade.amountError', { min: `${symbol}${minAmount.toLocaleString()}`, max: `${symbol}${maxAmount.toLocaleString()}` })}
                    </Text>
                  )
                )}
              </div>

              {/* Deposit rate input */}
              <div className="space-y-2">
                <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('trade.depositRate')}
                </Text>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={15}
                  step={0.5}
                  value={depositRate}
                  onChange={(e) => setDepositRate(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="rounded-full"
                />
                <Text variant="small" className="text-muted-foreground">
                  {t('trade.depositHint')}
                </Text>
                {depositRate !== '' && !depositValid && (
                  <Text variant="small" className="text-destructive">
                    {t('trade.depositError')}
                  </Text>
                )}
              </div>

              {/* Payment method dropdown + action */}
              <div className="space-y-2">
                <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('trade.paymentMethodLabel')}
                </Text>
                <div className="flex gap-2">
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="w-full rounded-full">
                      <SelectValue placeholder={t('trade.selectMethod')} />
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
                        {t('trade.opening')}
                      </>
                    ) : (
                      t('trade.openTrade')
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
