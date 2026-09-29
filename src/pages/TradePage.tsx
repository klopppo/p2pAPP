import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useAccount, usePublicClient, useWriteContract } from "wagmi"
import { type Abi } from "viem"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Text } from "@/components/ui/text"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppPageHeader } from "@/components/custom/AppPageHeader"
import { ChainGuard } from "@/components/custom/ChainGuard"
import { ShieldCheck, Clock, Globe, Tag, Loader2, Star } from "lucide-react"
import { useOffer } from "@/hooks/useOffers"
import {
  createTrade,
  ensureUser,
  getOfferTradeIntent,
  getTradeByEscrowAddress,
  type OfferTradeIntent,
} from "@/lib/supabase"
import {
  KLEROS_ESCROW_FACTORY_ABI,
  KLEROS_ESCROW_FACTORY_ADDRESS,
  ERC20_ABI,
  DEFAULT_SECURITY_DEPOSIT_BPS,
  MAX_GRACE_PERIOD_SECONDS,
  isFactoryConfigured,
} from "@/lib/contracts"
import { parseUnits } from "viem"
import { errorMessage } from "@/lib/errorMessage"
import { assertTxSuccess } from "@/lib/uiFormat"
import { currencySymbol } from "@/lib/utils"
import { REGION_NAMES } from "@/lib/locations"

type Stage = "idle" | "creating-escrow" | "mining" | "saving"

type CreateTradeInput = Parameters<typeof createTrade>[0]

// Orphan-escrow recovery: `createEscrow` deploys a clone on-chain and the
// trade row is persisted afterwards. If that persist fails (network/RLS) the
// clone exists but nothing references it, and retrying used to deploy a second
// clone. Remember the un-persisted input so a retry reuses the same escrow.
const pendingTradeKey = (offerId: string, wallet: string) =>
  `coffernode:pending-trade:${wallet.toLowerCase()}:${offerId}`
function readPendingTrade(offerId: string, wallet: string): CreateTradeInput | null {
  try {
    const raw = window.localStorage.getItem(pendingTradeKey(offerId, wallet))
    return raw ? (JSON.parse(raw) as CreateTradeInput) : null
  } catch {
    return null
  }
}
function rememberPendingTrade(offerId: string, wallet: string, input: CreateTradeInput): void {
  try {
    window.localStorage.setItem(pendingTradeKey(offerId, wallet), JSON.stringify(input))
  } catch {
    /* quota/private mode — the user can still retry manually */
  }
}
function clearPendingTrade(offerId: string, wallet: string): void {
  try {
    window.localStorage.removeItem(pendingTradeKey(offerId, wallet))
  } catch {
    /* ignore */
  }
}

export function TradePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { data: offer, isLoading, isError } = useOffer(id)
  const { t } = useTranslation()

  const [amount, setAmount] = useState("")
  const [depositRate, setDepositRate] = useState(
    String(Number(DEFAULT_SECURITY_DEPOSIT_BPS) / 100)
  )
  // Grace period in hours; prefilled from the offer, with a user override.
  const [gracePeriodInput, setGracePeriodInput] = useState<string | null>(null)
  const gracePeriod =
    gracePeriodInput ??
    (offer?.grace_period != null ? String(offer.grace_period) : "1")
  const [paymentMethod, setPaymentMethod] = useState<string>("")
  const [stage, setStage] = useState<Stage>("idle")

  const isSubmitting = stage !== "idle"
  const factoryReady = isFactoryConfigured()

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />{" "}
        {t("trade.loadingOffer")}
      </section>
    )
  }

  if (isError || !offer) {
    return (
      <section className="mx-auto max-w-xl space-y-6">
        <AppPageHeader
          title={t("trade.offerNotFound")}
          variant="centered"
          onBack={() => navigate(-1)}
        />
        <Card>
          <CardContent className="space-y-4">
            <Text variant="body" className="text-muted-foreground">
              {t("trade.offerNotFoundDescription")}
            </Text>
            <Button
              className="rounded-full"
              onClick={() => navigate("/app/offers")}
            >
              {t("trade.backToOffers")}
            </Button>
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
  const sellerName = seller?.nickname ?? seller?.public_handle ?? "Trader"
  const sellerHandle = seller?.public_handle ?? ""

  const paymentMethods: string[] = offer.payment_methods ?? []
  const regions: string[] = offer.available_regions ?? []
  const tags: string[] = offer.tags ?? []

  const amountNum = Number(amount)
  const amountValid =
    !!amount &&
    !Number.isNaN(amountNum) &&
    amountNum >= minAmount &&
    amountNum <= maxAmount
  const cryptoEstimate = amountValid && price > 0 ? amountNum / price : null

  // Percent (0–15); contract accepts exactly 0 or ≥ 1%.
  const depositRateNum = Number(depositRate)
  const depositValid =
    !Number.isNaN(depositRateNum) &&
    depositRateNum >= 0 &&
    depositRateNum <= 15 &&
    (depositRateNum === 0 || depositRateNum >= 1)
  // Guard the BigInt conversion: a non-finite input (e.g. "..") would throw
  // RangeError during render and take the whole page down.
  const depositBps =
    !depositValid || depositRateNum === 0
      ? 0n
      : BigInt(Math.round(depositRateNum * 100))

  // Bound by KlerosEsc.MAX_GRACE_PERIOD (365 days).
  const maxGraceHours = Number(MAX_GRACE_PERIOD_SECONDS) / 3600
  const gracePeriodNum = Number(gracePeriod)
  const gracePeriodValid =
    gracePeriod !== "" &&
    !Number.isNaN(gracePeriodNum) &&
    gracePeriodNum > 0 &&
    gracePeriodNum <= maxGraceHours
  const gracePeriodSeconds = gracePeriodValid
    ? BigInt(Math.round(gracePeriodNum * 3600))
    : 0n

  const expiresAt = offer.expires_at ? new Date(offer.expires_at) : null

  const handleOpenTrade = async () => {
    // Enter-in-input can fire submit while a previous createEscrow is in
    // flight; never deploy a second escrow for the same click sequence.
    if (isSubmitting) return
    if (!isConnected || !address) {
      toast.error(t("trade.errorConnectWallet"))
      return
    }
    if (!factoryReady) {
      toast.error(t("trade.errorFactoryNotConfigured"))
      return
    }
    if (!amountValid) {
      toast.error(
        t("trade.errorAmountRange", {
          min: `${symbol}${minAmount.toLocaleString()}`,
          max: `${symbol}${maxAmount.toLocaleString()}`,
        })
      )
      return
    }
    if (!paymentMethod) {
      toast.error(t("trade.errorSelectPayment"))
      return
    }
    if (!depositValid) {
      toast.error(t("trade.errorDepositRate"))
      return
    }
    if (!gracePeriodValid) {
      toast.error(t("trade.gracePeriodError"))
      return
    }
    if (!publicClient) {
      toast.error(t("trade.errorRpcClient"))
      return
    }

    setStage("creating-escrow")
    try {
      const me = await ensureUser(address)
      if (!me) {
        // Connected wallet without a SIWE session — require sign-in first.
        toast.error(t("trade.errorConnectWallet"))
        setStage("idle")
        return
      }

      // Recovery: a previous attempt deployed the escrow but failed to persist
      // the trade. Reuse the stored input instead of deploying a second clone.
      const pending = readPendingTrade(offer.id, address)
      if (pending) {
        setStage("saving")
        try {
          const existing = await getTradeByEscrowAddress(
            pending.escrow_contract_addr as string
          )
          if (existing) {
            clearPendingTrade(offer.id, address)
            toast.success(t("trade.successDeployed"))
            navigate(`/app/trades/${existing.id}`)
            return
          }
          const recovered = await createTrade(pending)
          clearPendingTrade(offer.id, address)
          toast.success(t("trade.successDeployed"))
          navigate(`/app/trades/${recovered.id}`)
        } catch (recoverErr) {
          toast.error(errorMessage(recoverErr, "trade", t, "errorFailedToDeploy"))
          setStage("idle")
        }
        return
      }

      // Counterparty identities come only from the server-side RPC (ADR-015),
      // which re-validates status/expiry and rejects self-trading.
      let intent: OfferTradeIntent
      try {
        intent = await getOfferTradeIntent(offer.id)
      } catch (err) {
        const code = (err as { code?: string }).code
        if (code === "P0200" || code === "P0201") {
          toast.error(t("trade.errorOfferUnavailable"))
        } else if (code === "P0202") {
          toast.error(t("trade.errorOwnOffer"))
        } else {
          toast.error(t("trade.errorOfferUnavailable"))
        }
        setStage("idle")
        return
      }
      const buyerId = intent.buyer_id
      const sellerId = intent.seller_id
      const isMakerBuyer = intent.taker_role === "seller"
      const buyerWallet = intent.buyer_wallet
      const sellerWallet = intent.seller_wallet
      const buyerWalletValid = /^0x[a-fA-F0-9]{40}$/.test(buyerWallet)
      const sellerWalletValid = /^0x[a-fA-F0-9]{40}$/.test(sellerWallet)
      if (!buyerWalletValid || !sellerWalletValid) {
        toast.error(t("trade.errorInvalidWallet"))
        setStage("idle")
        return
      }
      if (buyerWallet.toLowerCase() === sellerWallet.toLowerCase()) {
        toast.error(t("trade.errorSameCounterparty"))
        setStage("idle")
        return
      }

      const cryptoAmount = amountNum / price // human-units (e.g. 1.5 ETH)

      // Read pinned token/treasury/Kleros config in one round-trip; base units
      // keep sub-1-token amounts exact (they used to floor to 0).
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
          functionName: "token",
        }),
        publicClient.readContract({
          address: factoryAddress,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: "treasury",
        }),
        publicClient.readContract({
          address: factoryAddress,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: "klerosCourt",
        }),
        publicClient.readContract({
          address: factoryAddress,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: "klerosExtraDataPart1",
        }),
        publicClient.readContract({
          address: factoryAddress,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: "klerosExtraDataPart2",
        }),
      ])) as [
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
      ]

      // The treasury wallet can't be a trade party (contract InvalidTreasury).
      const treasuryLc = treasuryAddress.toLowerCase()
      if (
        treasuryLc === buyerWallet.toLowerCase() ||
        treasuryLc === sellerWallet.toLowerCase()
      ) {
        toast.error(t("trade.errorTreasuryParty"))
        setStage("idle")
        return
      }

      // The factory pins ONE token; reject when the offer symbol differs so
      // the escrow can't silently hold the wrong asset.
      try {
        const factorySymbol = (await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI as Abi,
          functionName: "symbol",
          args: [],
        })) as string
        if (
          factorySymbol &&
          String(token).toLowerCase() !== String(factorySymbol).toLowerCase()
        ) {
          toast.error(
            t("trade.errorTokenMismatch", {
              offered: token,
              escrow: factorySymbol,
              defaultValue:
                "This offer is denominated in {{offered}}, but the escrow contract only supports {{escrow}}.",
            })
          )
          setStage("idle")
          return
        }
      } catch (symbolErr) {
        // Non-standard ERC20 without symbol() — factory pinning still governs.
        console.warn("[TradePage] factory token symbol() read failed:", symbolErr)
      }

      const decimals = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI as Abi,
        functionName: "decimals",
        args: [],
      })) as number
      const safeDecimals = Math.min(Math.max(decimals, 0), 18)
      const cryptoBaseUnits = parseUnits(
        cryptoAmount.toFixed(safeDecimals),
        safeDecimals
      )
      if (cryptoBaseUnits === 0n) {
        toast.error(t("trade.errorAmountTooSmall"))
        setStage("idle")
        return
      }

      // Pre-flight gas estimate: surface the real revert and bound gas below
      // the RPC cap (wallets otherwise sign a padded 21M limit and trip it).
      let gas: bigint | undefined
      try {
        gas = await publicClient.estimateContractGas({
          address: factoryAddress,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: "createEscrow",
          args: [
            buyerWallet as `0x${string}`,
            sellerWallet as `0x${string}`,
            gracePeriodSeconds,
            cryptoBaseUnits,
            depositBps,
          ],
          account: address as `0x${string}`,
        })
      } catch (estErr) {
        const reason =
          estErr instanceof Error
            ? estErr.message.split("\n")[0].slice(0, 240)
            : String(estErr)
        console.error("[TradePage] createEscrow estimate reverted:", estErr)
        toast.error(t("trade.errorCreateEscrowEstimate"), {
          description: reason,
        })
        setStage("idle")
        return
      }
      // 30% headroom; stays below Infura's 16.7M per-tx ceiling.
      const gasLimit = ((gas ?? 1_500_000n) * 130n) / 100n

      // Deploy a KlerosEsc clone; explicit `gas` prevents viem's auto-estimate
      // fallback from hitting Infura's "gas limit too high" ceiling.
      setStage("mining")
      const txHash = await writeContractAsync({
        address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
        abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
        functionName: "createEscrow",
        args: [
          buyerWallet as `0x${string}`,
          sellerWallet as `0x${string}`,
          gracePeriodSeconds,
          cryptoBaseUnits,
          depositBps,
        ],
        gas: gasLimit,
      })
      // Bounded wait so an RPC stall can't leave the form spinning forever.
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 90_000,
      })
      assertTxSuccess(receipt)
      // Decode EscrowCreated and match BOTH buyer and seller — the naive
      // "first event"/count fallback can pick a clone from a concurrent trade.
      const { decodeEventLog } = await import("viem")
      let deployedAddress: `0x${string}` | null = null
      const factoryAbi = KLEROS_ESCROW_FACTORY_ABI as Abi
      const buyerWalletLc = buyerWallet.toLowerCase()
      const sellerWalletLc = sellerWallet.toLowerCase()
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: factoryAbi,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName === "EscrowCreated") {
            const args = decoded.args as {
              escrowAddress?: string
              buyer?: string
              seller?: string
            }
            const buyerMatch =
              !args.buyer || args.buyer.toLowerCase() === buyerWalletLc
            const sellerMatch =
              !args.seller || args.seller.toLowerCase() === sellerWalletLc
            if (args.escrowAddress && buyerMatch && sellerMatch) {
              deployedAddress = args.escrowAddress as `0x${string}`
              break
            }
          }
        } catch {
          // Not an EscrowCreated log; skip.
        }
      }

      if (!deployedAddress) {
        // Fallback: latest clone registered to the buyer.
        const cloneCount = (await publicClient.readContract({
          address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: "escrowCountByBuyer",
          args: [buyerWallet as `0x${string}`],
        })) as bigint
        if (cloneCount > 0n) {
          deployedAddress = (await publicClient.readContract({
            address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
            abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
            functionName: "escrowByBuyer",
            args: [buyerWallet as `0x${string}`, cloneCount - 1n],
          })) as `0x${string}`
        }
      }

      if (!deployedAddress) {
        throw new Error(t("trade.errorFailedToDeploy"))
      }

      // Persist the trade plus immutable on-chain metadata (treasury, creator,
      // Kleros court) so the trades list can skip the on-chain multicall.
      setStage("saving")
      const tradeInput = {
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
        taker_role: isMakerBuyer ? ("seller" as const) : ("buyer" as const),
        escrow_contract_addr: deployedAddress,
        creator: address,
        kleros_court_addr: klerosCourtAddr,
        kleros_extra_data_part1: klerosPart1,
        kleros_extra_data_part2: klerosPart2,
      }
      let trade
      try {
        trade = await createTrade(tradeInput)
      } catch (persistErr) {
        rememberPendingTrade(offer.id, address, tradeInput)
        throw persistErr
      }
      clearPendingTrade(offer.id, address)

      toast.success(t("trade.successDeployed"))
      navigate(`/app/trades/${trade.id}`)
    } catch (error) {
      if (readPendingTrade(offer.id, address)) {
        toast.error(t("trade.errorPersistPending"))
      } else {
        toast.error(errorMessage(error, "trade", t, "errorFailedToDeploy"))
      }
    } finally {
      setStage("idle")
    }
  }

  return (
    <section className="space-y-8">
      <ChainGuard />
      <div className="mx-auto max-w-xl space-y-6">
        <AppPageHeader
          title={
            offer.type === "sell"
              ? t("trade.buyToken", { token })
              : t("trade.sellToken", { token })
          }
          subtitle={t("trade.offerSubtitle", {
            type: offer.type,
            offerId: offer.offer_id ?? offer.id,
          })}
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
                    <AvatarFallback>
                      {sellerName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <Text variant="h4" className="truncate">
                      {sellerName}
                    </Text>
                    {sellerHandle && (
                      <Text
                        variant="small"
                        className="font-mono text-muted-foreground"
                      >
                        {sellerHandle}
                      </Text>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    {Number(seller?.avg_rating) ? (
                      <>
                        <Star className="h-4 w-4 fill-primary text-primary" />
                        <span className="font-medium">
                          {Number(seller?.avg_rating).toFixed(1)}
                        </span>
                      </>
                    ) : (
                      <>
                        <Star className="h-4 w-4 text-muted-foreground/60" />
                        <span className="text-muted-foreground">
                          {t("trade.noRating")}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="text-muted-foreground">·</span>
                  <span>
                    <span className="font-medium">
                      {(seller?.total_trades ?? 0).toLocaleString()}
                    </span>{" "}
                    <span className="text-muted-foreground">trades</span>
                  </span>
                </div>
              </div>

              <Separator />

              {/* Offer details */}
              <div className="space-y-3">
                <Text
                  variant="small"
                  className="font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {t("trade.offerDetails")}
                </Text>
                <div className="grid grid-cols-[auto_1fr] justify-start gap-x-6 gap-y-3 text-sm">
                  <span className="text-muted-foreground">
                    {t("trade.pricePerToken", { token })}
                  </span>
                  <span className="font-mono">
                    {symbol}
                    {price.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-muted-foreground">
                    {t("trade.tradeRange")}
                  </span>
                  <span className="font-mono">
                    {symbol}
                    {minAmount.toLocaleString()} – {symbol}
                    {maxAmount.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Globe className="h-4 w-4" /> {t("trade.currency")}
                  </span>
                  <span>{offer.fiat_currency}</span>
                  {expiresAt && (
                    <>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-4 w-4" /> {t("trade.expires")}
                      </span>
                      <span>{expiresAt.toLocaleDateString()}</span>
                    </>
                  )}
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" /> {t("trade.platformFee")}
                  </span>
                  <span className="font-mono">
                    {feePercent}%{networkFee > 0 ? ` (+${networkFee} gas)` : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {t("trade.paymentMethods")}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {paymentMethods.map((m) => (
                      <Badge
                        key={m}
                        variant="secondary"
                        className="rounded-full"
                      >
                        {m}
                      </Badge>
                    ))}
                  </span>
                  {regions.length > 0 && (
                    <>
                      <span className="text-muted-foreground">
                        {t("trade.regions")}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {regions.map((r) => (
                          <Badge
                            key={r}
                            variant="outline"
                            className="rounded-full"
                          >
                            {REGION_NAMES[r] ?? r}
                          </Badge>
                        ))}
                      </span>
                    </>
                  )}
                  {tags.length > 0 && (
                    <>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Tag className="h-4 w-4" /> {t("trade.tags")}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="rounded-full"
                          >
                            {tag}
                          </Badge>
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
                <Text
                  variant="small"
                  className="font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {t("trade.amountLabel", { currency: offer.fiat_currency })}
                </Text>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={t("trade.amountPlaceholder", {
                    min: minAmount,
                    max: maxAmount,
                  })}
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  className="rounded-full"
                />
                {cryptoEstimate !== null ? (
                  <Text variant="small" className="text-muted-foreground">
                    {t("trade.cryptoEstimate", {
                      amount: cryptoEstimate.toLocaleString("en-US", {
                        maximumFractionDigits: 6,
                      }),
                      token,
                    })}
                  </Text>
                ) : (
                  amount !== "" && (
                    <Text variant="small" className="text-destructive">
                      {t("trade.amountError", {
                        min: `${symbol}${minAmount.toLocaleString()}`,
                        max: `${symbol}${maxAmount.toLocaleString()}`,
                      })}
                    </Text>
                  )
                )}
              </div>

              {/* Deposit rate input */}
              <div className="space-y-2">
                <Text
                  variant="small"
                  className="font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {t("trade.depositRate")}
                </Text>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={15}
                  step={0.5}
                  value={depositRate}
                  onChange={(e) =>
                    setDepositRate(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  className="rounded-full"
                />
                <Text variant="small" className="text-muted-foreground">
                  {t("trade.depositHint")}
                </Text>
                {depositRate !== "" && !depositValid && (
                  <Text variant="small" className="text-destructive">
                    {t("trade.depositError")}
                  </Text>
                )}
              </div>

              {/* Grace period input */}
              <div className="space-y-2">
                <Text
                  variant="small"
                  className="font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {t("trade.gracePeriod")}
                </Text>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  value={gracePeriod}
                  onChange={(e) =>
                    setGracePeriodInput(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  className="rounded-full"
                />
                <Text variant="small" className="text-muted-foreground">
                  {t("trade.gracePeriodHint")}
                </Text>
                {gracePeriod !== "" && !gracePeriodValid && (
                  <Text variant="small" className="text-destructive">
                    {t("trade.gracePeriodError")}
                  </Text>
                )}
              </div>

              {/* Payment method dropdown + action */}
              <div className="space-y-2">
                <Text
                  variant="small"
                  className="font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {t("trade.paymentMethodLabel")}
                </Text>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={paymentMethod}
                    onValueChange={setPaymentMethod}
                  >
                    <SelectTrigger className="w-full rounded-full">
                      <SelectValue placeholder={t("trade.selectMethod")} />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="flex-1 rounded-full px-8 shadow-none sm:flex-none"
                    disabled={isSubmitting}
                    onClick={handleOpenTrade}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("trade.opening")}
                      </>
                    ) : (
                      t("trade.openTrade")
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
