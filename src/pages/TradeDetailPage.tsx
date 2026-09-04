import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi'
import { toast } from 'sonner'
import { formatUnits, maxUint256, type Abi } from 'viem'
import {
  ArrowLeft,
  Wallet,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Coins,
  CheckCircle2,
  Send,
  Timer,
  ExternalLink,
  XCircle,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CANCEL_TIMELOCK_SECONDS,
  ERC20_ABI,
  KLEROS_ESC_ABI,
  KlerosEscState,
  KlerosEscStateLabel,
  Ruling,
  type KlerosEscStateValue,
} from '@/lib/contracts'
import { useConversationByTradeId } from '@/hooks/useConversations'
import { useEscrowEventWatcher, useEscrowState } from '@/hooks/useDisputes'
import {
  EscrowStatus,
  getTradeById,
  setTradeEscrowStatus,
  TradeEventType,
  updateTradeStatus,
  updateUserReputation,
  upsertTradeEscrowStatus,
} from '@/lib/supabase'
import { errorMessage } from '@/lib/errorMessage'
import { explorerBase } from '@/lib/explorer'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useTradeRatings, useHasRated } from '@/hooks/useReviews'
import { ReviewForm } from '@/components/custom/ReviewForm'
import { StarRating } from '@/components/custom/StarRating'

type TxStage = 'idle' | 'approving' | 'depositing' | 'confirming' | 'mining'

/**
 * A `now`-clock that ticks every second while a state using timelocks is on
 * screen. Returns 0n (falsy) until the interval starts so the calling code can
 * gate on `nowSecs > 0n` for conditional rendering.
 */
function useNowSecsBig(): bigint {
  const [now, setNow] = useState(0n)
  useEffect(() => {
    const tick = () => setNow(BigInt(Math.floor(Date.now() / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function getTxLabel(t: (key: string) => string, stage: TxStage): string {
  const labels: Record<TxStage, string> = {
    idle: t('tradeDetail.continue'),
    approving: t('tradeDetail.approvingToken'),
    depositing: t('tradeDetail.confirmingDeposit'),
    confirming: t('tradeDetail.confirmingAction'),
    mining: t('tradeDetail.waitingConfirmation'),
  }
  return labels[stage]
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }

function formatTokenAmount(raw: bigint, decimals: number, symbol: string) {
  const human = formatUnits(raw, decimals)
  return `${human} ${symbol}`
}

function formatAddress(addr: string | null | undefined) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function TradeDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  // Pull the trade from Supabase via react-query (handles loading/error/cache).
  const {
    data: trade,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['trade', id],
    queryFn: () => getTradeById(id as string),
    enabled: !!id,
  })

  const escrowAddress = trade?.escrow_contract_addr as
    | `0x${string}`
    | undefined

  // Live on-chain escrow state.
  const { data: escrowState, refetch: refetchEscrow } = useEscrowState(
    escrowAddress,
  )

  // Read the trade token (immutable on the factory, but cached per escrow for
  // convenience). Used for ERC-20 approve + display.
  const tokenAddress = escrowState?.token
  const { data: tokenSymbol } = useReadContract({
    address: tokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI as Abi,
    functionName: 'symbol',
    args: [],
    query: { enabled: !!tokenAddress },
  }) as { data: string | undefined }
  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI as Abi,
    functionName: 'decimals',
    args: [],
    query: { enabled: !!tokenAddress },
  }) as { data: number | undefined }

  const decimals = typeof tokenDecimals === 'number' ? tokenDecimals : 18
  const symbol =
    (typeof tokenSymbol === 'string' ? tokenSymbol : null) ??
    trade?.crypto_token ??
    'TOKEN'

  const [txStage, setTxStage] = useState<TxStage>('idle')
  const isTxBusy = txStage !== 'idle'

  const isBuyer =
    !!address && !!escrowState && address.toLowerCase() === escrowState.buyer.toLowerCase()
  const isSeller =
    !!address && !!escrowState && address.toLowerCase() === escrowState.seller.toLowerCase()

  const onChainState = escrowState?.state
  // escrowState.state is typed as KlerosEscStateValue (already narrowed in
  // the hook). Guard the lookup so TS doesn't try to index with `undefined`.
  const liveState: KlerosEscStateValue | null =
    onChainState != null ? (onChainState as KlerosEscStateValue) : null
  const stateLabel =
    liveState != null ? KlerosEscStateLabel[liveState] : t('tradeDetail.loadingTrade')

  // ── Action: approve + deposit (buyer OR seller path) ─────────────────────
  const fundEscrow = async (
    which: 'buyer' | 'seller',
    amountWei: bigint,
    afterApprove: () => Promise<`0x${string}` | { depositHash: `0x${string}`; lockHash: `0x${string}` | null }>,
  ) => {
    if (!tokenAddress || !escrowAddress || !publicClient) return

    try {
      // 1) Check current allowance — skip approve if already sufficient.
      setTxStage('approving')
      const owner = address as `0x${string}`
      const currentAllowance = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI as Abi,
        functionName: 'allowance',
        args: [owner, escrowAddress],
      })) as bigint

      if (currentAllowance < amountWei) {
        const approveHash = await writeContractAsync({
          address: tokenAddress,
          abi: ERC20_ABI as Abi,
          functionName: 'approve',
          args: [escrowAddress, maxUint256],
        })
        // The deposit call below pulls funds via transferFrom, so the approve
        // MUST be mined before we proceed. Skipping this wait caused the
        // deposit tx to revert with an insufficient allowance when the approve
        // was still in the mempool — a wasted, gas-burning round-trip.
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }

      // 2) Call the appropriate deposit function on the escrow. The seller's
      //    path needs both depositSellerSecurityDeposit + lockFunds, so the
      //    callback may return two tx hashes (we mirror both).
      setTxStage('depositing')
      const result = await afterApprove()

      const depositTxHash: `0x${string}` =
        typeof result === 'string' ? result : result.depositHash
      const lockTxHash: `0x${string}` | null =
        typeof result === 'string' ? null : result.lockHash

      setTxStage('mining')
      await publicClient.waitForTransactionReceipt({ hash: depositTxHash })
      if (lockTxHash) {
        await publicClient.waitForTransactionReceipt({ hash: lockTxHash })
      }

      // 3) Mirror on-chain progress into Supabase so the listing pages can
      // filter by `escrow_status` without a re-read.
      const newStatus =
        which === 'buyer'
          ? EscrowStatus.BUYER_DEPOSITED
          : EscrowStatus.SELLER_DEPOSITED
      await upsertTradeEscrowStatus(
        trade!.id,
        newStatus,
        depositTxHash,
      ).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); /* non-fatal — the chain tx already happened */
      })

      // 3a) Seller path: after lockFunds the on-chain state moves from
      //      SELLER_DEPOSITED (or AWAITING_FUNDING) to FUNDED. Write the new
      //      status + log a granular event. Only fires when lockFunds()
      //      succeeded (i.e. when the buyer deposit was already in).
      if (lockTxHash) {
        await setTradeEscrowStatus(
          trade!.id,
          EscrowStatus.FUNDED,
          { txHash: lockTxHash, escrowEventType: TradeEventType.ESCROW_FUNDED },
        ).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); return undefined })
      }

      toast.success(
        which === 'buyer'
          ? t('tradeDetail.depositPostedSuccess')
          : t('tradeDetail.fundsLockedSuccess'),
      )
      refetchEscrow()
    } catch (err) {
      toast.error(
        which === 'buyer'
          ? errorMessage(err, 'tradeDetail', t, 'depositFailed')
          : errorMessage(err, 'tradeDetail', t, 'lockFailed'),
      )
    } finally {
      setTxStage('idle')
    }
  }

  const handleBuyerDeposit = async () => {
    if (!escrowState) return
    await fundEscrow(
      'buyer',
      escrowState.securityDepositAmount,
      () =>
        writeContractAsync({
          address: escrowAddress!,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: 'depositBuyerSecurityDeposit',
        }),
    )
  }

  const handleSellerFund = async () => {
    if (!escrowState) return
    // Seller locks tradeAmount + own deposit. One approve covers both calls
    // (we approve maxUint256 above), then depositSellerSecurityDeposit +
    // lockFunds happen in sequence.
    await fundEscrow(
      'seller',
      escrowState.tradeAmount + escrowState.securityDepositAmount,
      async () => {
        // Deposit first so the state machine passes the SellerDepositFirst
        // check inside lockFunds().
        const depHash = await writeContractAsync({
          address: escrowAddress!,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: 'depositSellerSecurityDeposit',
        })
        await publicClient!.waitForTransactionReceipt({ hash: depHash })
        const lockHash = await writeContractAsync({
          address: escrowAddress!,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: 'lockFunds',
        })
        return { depositHash: depHash, lockHash }
      },
    )
  }

  const handleConfirm = async () => {
    if (!escrowAddress) return
    try {
      setTxStage('confirming')
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'confirm',
      })
      setTxStage('mining')
      await publicClient!.waitForTransactionReceipt({ hash: txHash })
      await setTradeEscrowStatus(trade!.id, EscrowStatus.CONFIRMED, {
        txHash,
        escrowEventType: TradeEventType.ESCROW_CONFIRMED,
      }).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); return undefined })
      toast.success(t('tradeDetail.confirmSuccess'))
      refetchEscrow()
    } catch (err) {
      toast.error(errorMessage(err, 'tradeDetail', t, 'confirmFailed'))
    } finally {
      setTxStage('idle')
    }
  }

  const handleRelease = async () => {
    if (!escrowAddress) return
    try {
      setTxStage('confirming')
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'release',
      })
      setTxStage('mining')
      await publicClient!.waitForTransactionReceipt({ hash: txHash })
      // Mirror the terminal outcome: funds delivered to buyer.
      await updateTradeStatus(trade!.id, 'completed', {
        escrowStatus: EscrowStatus.RELEASED,
        txHash,
        escrowEventType: TradeEventType.ESCROW_RELEASED,
      }).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); /* non-fatal — the chain tx already happened */
      })
      // Successful release bumps both parties' reputation slightly. The
      // RPC clamps the overall score to [0,100].
      if (trade) {
        await Promise.allSettled([
          updateUserReputation(trade.buyer_id, 3),
          updateUserReputation(trade.seller_id, 3),
        ])
      }
      toast.success(t('tradeDetail.releaseSuccess'))
      refetchEscrow()
    } catch (err) {
      toast.error(errorMessage(err, 'tradeDetail', t, 'releaseFailed'))
    } finally {
      setTxStage('idle')
    }
  }

  // ── Action: execute a received Kleros ruling ─────────────────────────────
  const handleExecuteRuling = async () => {
    if (!escrowAddress) return
    try {
      setTxStage('confirming')
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'executeRuling',
      })
      setTxStage('mining')
      await publicClient!.waitForTransactionReceipt({ hash: txHash })
      // Rulings 1/3 award the crypto to the buyer (refund); 0/2/4 leave it
      // with the seller (completed release). Mirror accordingly.
      const ruling = escrowState?.currentRuling != null ? Number(escrowState.currentRuling) : undefined
      const buyerWins =
        ruling === Ruling.AWARD_BUYER_PENALTY_SELLER ||
        ruling === Ruling.AWARD_BUYER_RETURN_DEPOSITS
      await updateTradeStatus(trade!.id, buyerWins ? 'refunded' : 'completed', {
        escrowStatus: buyerWins ? EscrowStatus.REFUNDED : EscrowStatus.RELEASED,
        txHash,
        escrowEventType: TradeEventType.ESCROW_RESOLVED,
      }).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); /* non-fatal — the chain tx already happened */
      })
      // Reputation: small bump to the winner, small penalty to the loser.
      if (trade) {
        const winnerId = buyerWins ? trade.buyer_id : trade.seller_id
        const loserId = buyerWins ? trade.seller_id : trade.buyer_id
        await Promise.allSettled([
          updateUserReputation(winnerId, 2),
          updateUserReputation(loserId, -3),
        ])
      }
      toast.success(t('tradeDetail.rulingExecutedSuccess'))
      refetchEscrow()
    } catch (err) {
      toast.error(errorMessage(err, 'tradeDetail', t, 'rulingExecutedFailed'))
    } finally {
      setTxStage('idle')
    }
  }

  // ── Derived action visibility ─────────────────────────────────────────────
  const showBuyerDeposit =
    !!isBuyer && liveState === KlerosEscState.AWAITING_FUNDING
  const showSellerDeposit =
    !!isSeller &&
    liveState === KlerosEscState.AWAITING_FUNDING &&
    !(escrowState?.buyerSecurityDeposited ?? false)
  const showSellerLock =
    !!isSeller &&
    liveState === KlerosEscState.AWAITING_FUNDING &&
    (escrowState?.buyerSecurityDeposited ?? false) &&
    !(escrowState?.sellerSecurityDeposited ?? false)
  const showBuyerConfirm =
    !!isBuyer && liveState === KlerosEscState.FUNDED

  // CONFIRMED_PENDING: gate `release()` on the on-chain grace period having
  // elapsed (`now >= confirmationTime + gracePeriod`). `confirmationTime` is
  // zero until the buyer has actually called `confirm()`.
  const nowSecsBig = useNowSecsBig()
  const graceEndSeconds = useMemo(() => {
    if (!escrowState || liveState !== KlerosEscState.CONFIRMED_PENDING) return null
    if (escrowState.confirmationTime === 0n) return null
    return escrowState.confirmationTime + escrowState.gracePeriod
  }, [escrowState, liveState])
  const gracePeriodElapsed =
    graceEndSeconds != null && nowSecsBig >= graceEndSeconds
  const showRelease =
    liveState === KlerosEscState.CONFIRMED_PENDING && gracePeriodElapsed === true
  const showExecuteRuling =
    liveState === KlerosEscState.RULING_RECEIVED
  // raiseDispute is callable from FUNDED (no grace window) and from
  // CONFIRMED_PENDING while still inside the grace window. After the
  // grace window closes (now >= confirmationTime + gracePeriod),
  // KlerosEsc.raiseDispute reverts with DisputeWindowClosed() — we
  // mirror that boundary here so the user doesn't click into a
  // guaranteed revert.
  const disputeWindowClosed =
    liveState === KlerosEscState.CONFIRMED_PENDING &&
    gracePeriodElapsed === true
  const showRaiseDispute =
    (liveState === KlerosEscState.FUNDED ||
      liveState === KlerosEscState.CONFIRMED_PENDING) &&
    (isBuyer || isSeller) &&
    !disputeWindowClosed

  // Funding-phase timelock cancel. Per KlerosEsc.cancelTrade():
  //   buyer  → buyerSecurityDeposited && !fundsLocked && now >= buyerDepositTime + 1 day
  //   seller → sellerSecurityDeposited && !buyerSecurityDeposited && now >= sellerDepositTime + 1 day
  // We surface the button when the connected wallet could plausibly call it
  // and let the contract revert if the timelock hasn't elapsed.
  // NOTE: reuses the single `nowSecsBig` ticker above — a second `useNowSecsBig`
  // would double the 1s interval + re-render churn for no benefit.
  const { showCancel } = useMemo(() => {
    const buyerOk =
      !!isBuyer &&
      liveState === KlerosEscState.AWAITING_FUNDING &&
      (escrowState?.buyerSecurityDeposited ?? false) &&
      !(escrowState?.fundsLocked ?? false) &&
      (escrowState?.buyerDepositTime ?? 0n) > 0n &&
      nowSecsBig >= (escrowState?.buyerDepositTime ?? 0n) + CANCEL_TIMELOCK_SECONDS
    const sellerOk =
      !!isSeller &&
      liveState === KlerosEscState.AWAITING_FUNDING &&
      (escrowState?.sellerSecurityDeposited ?? false) &&
      !(escrowState?.buyerSecurityDeposited ?? false) &&
      (escrowState?.sellerDepositTime ?? 0n) > 0n &&
      nowSecsBig >= (escrowState?.sellerDepositTime ?? 0n) + CANCEL_TIMELOCK_SECONDS
    return { showCancel: buyerOk || sellerOk }
  }, [
    isBuyer,
    isSeller,
    liveState,
    nowSecsBig,
    escrowState?.buyerSecurityDeposited,
    escrowState?.fundsLocked,
    escrowState?.buyerDepositTime,
    escrowState?.sellerSecurityDeposited,
    escrowState?.sellerDepositTime,
  ])

  const handleCancelTrade = async () => {
    if (!escrowAddress) return
    try {
      setTxStage('confirming')
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'cancelTrade',
      })
      setTxStage('mining')
      await publicClient!.waitForTransactionReceipt({ hash: txHash })
      // Funding-phase mutual cancel — both parties get their own deposits
      // back (and seller gets tradeAmount back if it was locked). NOT a
      // ruling; do not label this as 'refunded' (which means buyer-favorable
      // dispute payout). Use EscrowStatus.CANCELLED.
      await updateTradeStatus(trade!.id, 'cancelled', {
        escrowStatus: EscrowStatus.CANCELLED,
        txHash,
        escrowEventType: TradeEventType.ESCROW_CANCELLED,
      }).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); return undefined })
      toast.success(t('tradeDetail.cancelSuccess'))
      refetchEscrow()
    } catch (err) {
      toast.error(errorMessage(err, 'tradeDetail', t, 'cancelFailed'))
    } finally {
      setTxStage('idle')
    }
  }

  // ── B-2: live refresh on counterparty actions ───────────────────────────
  // The KlerosEsc emits events for every state transition. We mount the
  // shared watcher here so counterparty `cancelTrade` / `release` / `lockFunds`
  // / deposit events show up without a manual page refresh. Only relevant
  // financing-phase + dispute-lifecycle events are dispatched by name.
  // Depend on the primitive `tradeId` (not the full `trade` object): react-query
  // hands back a fresh reference on every refetch, which would otherwise tear
  // down + resubscribe the watcher each poll and miss on-chain events in the gap.
  const tradeId = trade?.id
  const handleEscrowEvent = useCallback(
    (name: string) => {
      if (!tradeId) return
      if (
        name === 'Released' ||
        name === 'TradeCancelled' ||
        name === 'FundsReturned' ||
        name === 'TradeFullyFunded' ||
        name === 'BuyerSecurityDeposited' ||
        name === 'SellerSecurityDeposited' ||
        name === 'SellerFundsLocked' ||
        name === 'Confirmed'
      ) {
        refetchEscrow()
        // Mirror the financing-phase transition into Supabase so the trades
        // list + dispute page see the new state immediately.
        if (name === 'TradeFullyFunded') {
          setTradeEscrowStatus(tradeId, EscrowStatus.FUNDED, {
            escrowEventType: TradeEventType.ESCROW_FUNDED,
          }).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); return undefined })
        } else if (name === 'Confirmed') {
          setTradeEscrowStatus(tradeId, EscrowStatus.CONFIRMED, {
            escrowEventType: TradeEventType.ESCROW_CONFIRMED,
          }).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); return undefined })
        } else if (name === 'BuyerSecurityDeposited') {
          upsertTradeEscrowStatus(
            tradeId,
            EscrowStatus.BUYER_DEPOSITED,
          ).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); return undefined })
        } else if (
          name === 'SellerSecurityDeposited' ||
          name === 'SellerFundsLocked'
        ) {
          upsertTradeEscrowStatus(
            tradeId,
            EscrowStatus.SELLER_DEPOSITED,
          ).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); return undefined })
        } else if (name === 'TradeCancelled') {
          updateTradeStatus(tradeId, 'cancelled', {
            escrowStatus: EscrowStatus.CANCELLED,
            escrowEventType: TradeEventType.ESCROW_CANCELLED,
          }).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); return undefined })
        } else if (name === 'Released') {
          updateTradeStatus(tradeId, 'completed', {
            escrowStatus: EscrowStatus.RELEASED,
            escrowEventType: TradeEventType.ESCROW_RELEASED,
          }).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); return undefined })
        }
      }
    },
    [escrowAddress, tradeId, refetchEscrow],
  )
  useEscrowEventWatcher(escrowAddress, handleEscrowEvent)

  // ── Rating section ─────────────────────────────────────────────────────
  const { data: currentUser } = useCurrentUser()
  const myId = currentUser?.id

  const myRole: 'buyer' | 'seller' | null =
    myId === trade?.buyer_id ? 'buyer' :
    myId === trade?.seller_id ? 'seller' : null

  const ratedId = myRole === 'buyer' ? trade?.seller_id : trade?.buyer_id
  const ratingDirection = myRole === 'buyer' ? 'seller' as const : 'buyer' as const

  const showRatingForm =
    liveState === KlerosEscState.COMPLETED &&
    isConnected && !!myId && !!myRole && !!ratedId

  const { data: hasRated = false } = useHasRated(
    showRatingForm ? trade?.id : undefined,
    myId,
  )

  const { data: tradeRatings = [] } = useTradeRatings(
    liveState === KlerosEscState.COMPLETED ? trade?.id : undefined,
  )

  // Chat counterpart — conversation is created by the
  // create_conversation_for_trade trigger on trade insert.
  const { data: conversation } = useConversationByTradeId(
    trade?.id ?? null,
  )
  const messageCounterpart =
    !!trade && isConnected && !!conversation?.id
      ? `/app/messages/${conversation.id}`
      : null

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />         {t('tradeDetail.loadingTrade')}
      </section>
    )
  }

  if (isError || !trade) {
    return (
      <div className="w-full max-w-xl mx-auto">
        <Card className="glass-panel rounded-2xl">
          <CardContent className="space-y-4">
            <Text variant="h4">{t('tradeDetail.tradeNotFound')}</Text>
            <Text variant="muted" className="text-sm">
              {error instanceof Error
                ? error.message
                : t('tradeDetail.tradeRemovedOrNoAccess')}
            </Text>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => navigate('/app/offers')}
            >
              {t('tradeDetail.backToOffers')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label={t('tradeDetail.back')}
          className="rounded-full"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Text
          variant="small"
          className="uppercase tracking-wider text-muted-foreground"
        >
          {trade.trade_id}
        </Text>
        {liveState != null && (
          <span className="inline-flex items-center px-2 h-5 rounded-full bg-muted text-xs font-medium">
            {stateLabel}
          </span>
        )}
      </div>

      <Text as="h2" variant="h2" className="mb-1">
        {t('tradeDetail.trade')} {trade.crypto_token}
      </Text>
      <Text variant="muted">
        {trade.crypto_amount} {trade.crypto_token} ·{' '}
        {CURRENCY_SYMBOLS[trade.fiat_currency ?? ''] ?? ''}
        {trade.fiat_amount} {trade.fiat_currency}
      </Text>

      {/* Wallet-not-connected */}
      {!isConnected && (
        <Alert className="mt-3 rounded-2xl">
          <Wallet className="w-4 h-4" />
          <AlertDescription>
            {t('tradeDetail.connectWallet')}
          </AlertDescription>
        </Alert>
      )}

      {/* Escrow contract + chain state */}
      {escrowAddress && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            {t('tradeDetail.escrowContract')}
          </Text>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <code className="font-mono text-xs break-all">
                {escrowAddress}
              </code>
              <a
                href={`${explorerBase.address}${escrowAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
              >
                Etherscan <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {escrowState && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    {t('trades.buyerLabel')}
                  </Text>
                  <Link to={`/app/profile/${escrowState.buyer}`} className="font-mono hover:underline text-foreground">
                    {formatAddress(escrowState.buyer)}
                  </Link>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    {t('trades.sellerLabel')}
                  </Text>
                  <Link to={`/app/profile/${escrowState.seller}`} className="font-mono hover:underline text-foreground">
                    {formatAddress(escrowState.seller)}
                  </Link>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    {t('tradeDetail.tradeAmount')}
                  </Text>
                  <p className="font-mono">
                    {formatTokenAmount(escrowState.tradeAmount, decimals, symbol)}
                  </p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    {t('tradeDetail.securityDeposit')}
                  </Text>
                  <p className="font-mono">
                    {formatTokenAmount(
                      escrowState.securityDepositAmount,
                      decimals,
                      symbol,
                    )}
                  </p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    {t('tradeDetail.fee')}
                  </Text>
                  <p className="font-mono">
                    {(Number(escrowState.feeBps) / 100).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    {t('tradeDetail.gracePeriod')}
                  </Text>
                  <p className="font-mono">
                    {(Number(escrowState.gracePeriod) / 86400).toFixed(0)}d
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Funding progress */}
      {escrowState && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            {t('tradeDetail.funding')}
          </Text>

          <div className="space-y-3 text-sm">
            <FundingRow
              label={`${t('tradeDetail.buyerDeposit')} (${formatTokenAmount(escrowState.securityDepositAmount, decimals, symbol)})`}
              done={escrowState.buyerSecurityDeposited}
              who="buyer"
              isMe={isBuyer}
              t={t}
            />
            <FundingRow
              label={`${t('tradeDetail.sellerLock')} (${formatTokenAmount(escrowState.tradeAmount + escrowState.securityDepositAmount, decimals, symbol)})`}
              done={escrowState.sellerSecurityDeposited && escrowState.fundsLocked}
              who="seller"
              isMe={isSeller}
              t={t}
              subDone={
                escrowState.sellerSecurityDeposited && !escrowState.fundsLocked
                  ? t('tradeDetail.depositPosted') + ' · lockFunds()'
                  : undefined
              }
            />
          </div>

          <Separator />

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-2">
            {showBuyerDeposit && (
              <Button
                onClick={handleBuyerDeposit}
                disabled={isTxBusy || !tokenAddress}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? getTxLabel(t, txStage) : t('tradeDetail.approveAndPostDeposit')}
              </Button>
            )}

            {showSellerDeposit && (
              <Button
                onClick={handleSellerFund}
                disabled={isTxBusy || !tokenAddress}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Coins className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? getTxLabel(t, txStage) : t('tradeDetail.approveAndPostDeposit')}
              </Button>
            )}

            {showSellerLock && (
              <Button
                onClick={handleSellerFund}
                disabled={isTxBusy}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Coins className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? getTxLabel(t, txStage) : t('tradeDetail.approveAndLock')}
              </Button>
            )}

            {showBuyerConfirm && (
              <Button
                onClick={handleConfirm}
                disabled={isTxBusy}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? getTxLabel(t, txStage) : t('tradeDetail.confirmPayment')}
              </Button>
            )}

            {showRelease && (
              <Button
                onClick={handleRelease}
                disabled={isTxBusy}
                variant="outline"
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? getTxLabel(t, txStage) : t('tradeDetail.releaseCrypto')}
              </Button>
            )}
            {!gracePeriodElapsed &&
              liveState === KlerosEscState.CONFIRMED_PENDING &&
              graceEndSeconds != null && (
                <p className="text-xs text-muted-foreground text-center inline-flex items-center justify-center gap-1.5">
                  <Timer className="w-3.5 h-3.5" />
                  {t('tradeDetail.releaseAvailableIn', {
                    seconds:
                      graceEndSeconds > nowSecsBig
                        ? (graceEndSeconds - nowSecsBig).toString()
                        : '0',
                  })}
                </p>
              )}

            {showExecuteRuling && (
              <Button
                onClick={handleExecuteRuling}
                disabled={isTxBusy}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? getTxLabel(t, txStage) : t('tradeDetail.executeRuling')}
              </Button>
            )}

            {showRaiseDispute && (
              <Button
                asChild
                variant="ghost"
                className="rounded-full"
              >
                <Link
                  to={`/app/dispute?tradeId=${trade.id}&escrowAddress=${escrowAddress ?? ''}`}
                >
                  <ShieldAlert className="w-4 h-4 mr-2" />
                  {t('tradeDetail.raiseDispute')}
                </Link>
              </Button>
            )}

            {messageCounterpart && (
              <Button
                asChild
                variant="ghost"
                className="rounded-full"
                title={t('tradeDetail.messageCounterpartTitle')}
              >
                <Link to={messageCounterpart}>
                  <MessageCircle className="w-4 h-4 mr-2" />
                  {t('tradeDetail.messageCounterpart')}
                </Link>
              </Button>
            )}

            {showCancel && (
              <Button
                onClick={handleCancelTrade}
                disabled={isTxBusy}
                variant="ghost"
                className="rounded-full text-muted-foreground hover:text-destructive"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? getTxLabel(t, txStage) : t('tradeDetail.cancelTrade')}
              </Button>
            )}

            {!isConnected && (
              <p className="text-xs text-muted-foreground text-center">
                {t('tradeDetail.connectWalletAction')}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Rating form — shown after escrow RELEASED, only for trade participants who haven't rated yet */}
      {showRatingForm && !hasRated && (
        <ReviewForm
          tradeId={trade.id}
          ratedUserId={ratedId!}
          direction={ratingDirection}
        />
      )}

      {/* Existing trade ratings */}
      {tradeRatings.length > 0 && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-3">
            {t('tradeDetail.tradeRatings')}
          </Text>
          <div className="space-y-3">
            {tradeRatings.map((r) => (
              <div key={r.id} className="flex items-start gap-3 py-2">
                <StarRating value={r.score} readonly size="sm" />
                <div className="min-w-0 flex-1">
                  <Text variant="small" className="font-medium">
                    {r.anonymous
                      ? t('tradeDetail.anonymous')
                      : (r.rater as { nickname?: string | null })?.nickname ?? t('tradeDetail.trader')}
                  </Text>
                  {r.comment && (
                    <Text variant="muted" className="text-sm mt-0.5">
                      {r.comment}
                    </Text>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function FundingRow({
  label,
  done,
  who,
  isMe,
  subDone,
  t,
}: {
  label: string
  done: boolean
  who: 'buyer' | 'seller'
  isMe: boolean
  subDone?: string
  t: (key: string, opts?: Record<string, string>) => string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {done ? (
          <CheckCircle2 className="w-4 h-4 text-success" />
        ) : (
          <Timer className="w-4 h-4 text-muted-foreground" />
        )}
        <span>{label}</span>
        {isMe && (
          <span className="text-xs text-muted-foreground">({t('tradeDetail.you')})</span>
        )}
      </div>
      <span
        className={`text-xs ${done ? 'text-success' : 'text-muted-foreground'}`}
      >
        {done ? (subDone ?? t('tradeDetail.done')) : t(`tradeDetail.waitingFor${who === 'buyer' ? 'Buyer' : 'Seller'}`)}
      </span>
    </div>
  )
}

// Keep imports minimal — Label removed (was unused).
void 0