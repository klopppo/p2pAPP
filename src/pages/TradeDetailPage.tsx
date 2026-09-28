import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currencySymbol, formatGracePeriod, formatDuration } from '@/lib/utils'
import { assertTxSuccess, formatAddress } from '@/lib/uiFormat'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi'
import { toast } from 'sonner'
import { formatUnits, type Abi } from 'viem'
import {
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
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { ChainGuard } from '@/components/custom/ChainGuard'
import {
  CANCEL_TIMELOCK_SECONDS,
  ERC20_ABI,
  KLEROS_ESC_ABI,
  KlerosEscState,
  Ruling,
  type KlerosEscStateValue,
} from '@/lib/contracts'
import { useConversationByTradeId } from '@/hooks/useConversations'
import { useEscrowEventWatcher, useEscrowState } from '@/hooks/useDisputes'
import { useVerifiedEscrow } from '@/hooks/useVerifiedEscrow'
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
import { useWalletSession } from '@/hooks/useWalletSession'
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

function formatTokenAmount(raw: bigint, decimals: number, symbol: string) {
  const human = formatUnits(raw, decimals)
  return `${human} ${symbol}`
}

function warnRejected(results: PromiseSettledResult<unknown>[]) {
  for (const r of results) {
    if (r.status === 'rejected') console.warn('[TradeDetailPage.tsx] reputation update failed:', r.reason)
  }
}

export function TradeDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { sessionWallet, hasSession } = useWalletSession()

  // Pull the trade from Supabase via react-query (handles loading/error/cache).
  const {
    data: trade,
    isLoading,
    isError,
    error,
  } = useQuery({
    // Session wallet in the key + a session gate so a cold-load anonymous
    // read can't cache `null` (trades_select_parties denies anon) under this
    // key and leave the page stuck on "not found" after sign-in.
    queryKey: ['trade', id, sessionWallet],
    queryFn: () => getTradeById(id as string),
    enabled: !!id && hasSession,
  })

  const escrowAddress = trade?.escrow_contract_addr as
    | `0x${string}`
    | undefined

  // Live on-chain escrow state.
  const { data: escrowState, refetch: refetchEscrow } = useEscrowState(
    escrowAddress,
  )

  // Trust gate: before any fund-moving write, confirm the factory deployed this
  // escrow for this wallet; lookup failure/pending stays unverified (CTAs off).
  const {
    isVerified: escrowVerified,
    isVerifying: escrowVerifying,
  } = useVerifiedEscrow(escrowAddress)

  // Trade token (immutable on the factory) for ERC-20 approve + display.
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

  // Allowance drives the "Approve + …" → "Send" label; refetched post-approve.
  const { data: allowance, refetch: refetchAllowance } = useQuery<bigint | null>({
    queryKey: ['escrow-allowance', chainId, tokenAddress, escrowAddress, address],
    queryFn: async () => {
      if (!publicClient || !tokenAddress || !escrowAddress || !address) return null
      return (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI as Abi,
        functionName: 'allowance',
        args: [address as `0x${string}`, escrowAddress],
      })) as bigint
    },
    enabled: !!publicClient && !!tokenAddress && !!escrowAddress && !!address,
    staleTime: 5_000,
  })

  // Amount the current role needs approved (seller may need deposit + lock).
  const sellerNeedsDeposit =
    !!escrowState &&
    escrowState.securityDepositPct > 0n &&
    !escrowState.sellerSecurityDeposited
  const buyerAmountWei = escrowState?.securityDepositAmount ?? 0n
  const sellerAmountWei = escrowState
    ? escrowState.tradeAmount +
      (sellerNeedsDeposit ? escrowState.securityDepositAmount : 0n)
    : 0n
  const buyerAllowanceReady =
    buyerAmountWei > 0n && allowance != null && allowance >= buyerAmountWei
  const sellerAllowanceReady =
    sellerAmountWei > 0n && allowance != null && allowance >= sellerAmountWei

  const onChainState = escrowState?.state
  // Guard the state lookup so TS can't index with `undefined`.
  const liveState: KlerosEscStateValue | null =
    onChainState != null ? (onChainState as KlerosEscStateValue) : null

  // Gate every escrow write on factory membership (buttons are also disabled;
  // re-checking here guards against a stale render re-enabling one).
  const requireVerifiedEscrow = useCallback((): boolean => {
    if (escrowVerified) return true
    toast.error(
      t('tradeDetail.escrowUnverified', {
        defaultValue:
          'This escrow could not be verified against the configured factory for your wallet. The action is disabled to protect your funds.',
      }),
    )
    return false
  }, [escrowVerified, t])

  // ── Action: approve + deposit (buyer OR seller path) ─────────────────────
  const fundEscrow = async (
    which: 'buyer' | 'seller',
    amountWei: bigint,
    afterApprove: () => Promise<
      `0x${string}` | { depositHash: `0x${string}` | null; lockHash: `0x${string}` | null }
    >,
  ) => {
    if (!tokenAddress || !escrowAddress || !publicClient) return
    if (!requireVerifiedEscrow()) return

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
        // Approve the exact amount this path pulls — never unlimited — so a
        // bad escrow address can't drain more than the trade needs. Wait for
        // the approve to mine before depositing so it can't outrun allowance.
        const approveHash = await writeContractAsync({
          address: tokenAddress,
          abi: ERC20_ABI as Abi,
          functionName: 'approve',
          args: [escrowAddress, amountWei],
        })
        assertTxSuccess(
          await publicClient.waitForTransactionReceipt({
            hash: approveHash,
            timeout: 90_000,
          }),
        )
        // Invalidate allowance so the CTA flips to "Send" immediately.
        toast.success(t('tradeDetail.approveSuccess'))
        void refetchAllowance()
      }

      // 2) Deposit callback may return two tx hashes on the seller path.
      setTxStage('depositing')
      const result = await afterApprove()

      const depositTxHash: `0x${string}` | null =
        typeof result === 'string' ? result : result.depositHash
      const lockTxHash: `0x${string}` | null =
        typeof result === 'string' ? null : result.lockHash

      setTxStage('mining')
      // Reverted receipts don't throw — assert before success toast/mirror.
      if (depositTxHash) {
        assertTxSuccess(await publicClient.waitForTransactionReceipt({ hash: depositTxHash }))
      }
      if (lockTxHash) {
        assertTxSuccess(await publicClient.waitForTransactionReceipt({ hash: lockTxHash }))
      }

      // 3) Mirror escrow_status for the listing pages; the lock tx is the
      // anchor when there is no deposit tx (0%-deposit seller path).
      const anchorTxHash = depositTxHash ?? lockTxHash
      if (!anchorTxHash) return
      const newStatus =
        which === 'buyer'
          ? EscrowStatus.BUYER_DEPOSITED
          : EscrowStatus.SELLER_DEPOSITED
      await upsertTradeEscrowStatus(
        trade!.id,
        newStatus,
        anchorTxHash,
      ).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); /* non-fatal — the chain tx already happened */
      })

      // 3a) FUNDED only when the deposit requirement is met (pct == 0 or both
      //     deposits in); writing it unconditionally could contradict chain.
      if (lockTxHash) {
        const fullyFunded =
          escrowState.securityDepositPct === 0n ||
          (escrowState.buyerSecurityDeposited && escrowState.sellerSecurityDeposited)
        if (fullyFunded) {
          await setTradeEscrowStatus(
            trade!.id,
            EscrowStatus.FUNDED,
            { txHash: lockTxHash, escrowEventType: TradeEventType.ESCROW_FUNDED },
          ).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); return undefined })
        }
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
    // depositBuyerSecurityDeposit() reverts when the deposit is 0%.
    if (escrowState.securityDepositPct === 0n) return
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
    // deposit+lock ordering matters: when pct > 0, lockFunds() requires
    // sellerSecurityDeposited, but re-depositing reverts AlreadyDeposited.
    const needsDeposit =
      escrowState.securityDepositPct > 0n && !escrowState.sellerSecurityDeposited
    const amountWei =
      escrowState.tradeAmount + (needsDeposit ? escrowState.securityDepositAmount : 0n)

    await fundEscrow('seller', amountWei, async () => {
      let depositHash: `0x${string}` | null = null
      if (needsDeposit) {
        depositHash = await writeContractAsync({
          address: escrowAddress!,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: 'depositSellerSecurityDeposit',
        })
        assertTxSuccess(
          await publicClient!.waitForTransactionReceipt({ hash: depositHash }),
        )
      }
      const lockHash = await writeContractAsync({
        address: escrowAddress!,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'lockFunds',
      })
      return { depositHash, lockHash }
    })
  }

  const handleConfirm = async () => {
    if (!escrowAddress) return
    if (!requireVerifiedEscrow()) return
    try {
      setTxStage('confirming')
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'confirm',
      })
      setTxStage('mining')
      assertTxSuccess(await publicClient!.waitForTransactionReceipt({ hash: txHash }))
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
    if (!requireVerifiedEscrow()) return
    try {
      setTxStage('confirming')
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'release',
      })
      setTxStage('mining')
      assertTxSuccess(await publicClient!.waitForTransactionReceipt({ hash: txHash }))
      // Mirror the terminal outcome: funds delivered to buyer.
      await updateTradeStatus(trade!.id, 'completed', {
        escrowStatus: EscrowStatus.RELEASED,
        txHash,
        escrowEventType: TradeEventType.ESCROW_RELEASED,
      }).catch((err) => { console.warn('[TradeDetailPage.tsx]', err); /* non-fatal — the chain tx already happened */
      })
      // Bump both parties' reputation (RPC clamps the score to [0,100]).
      if (trade) {
        warnRejected(
          await Promise.allSettled([
            updateUserReputation(trade.buyer_id, 3),
            updateUserReputation(trade.seller_id, 3),
          ]),
        )
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
    if (!requireVerifiedEscrow()) return
    try {
      setTxStage('confirming')
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'executeRuling',
      })
      setTxStage('mining')
      assertTxSuccess(await publicClient!.waitForTransactionReceipt({ hash: txHash }))
      // Rulings 1/3 → buyer refund; 0/2/4 → seller release.
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
        warnRejected(
          await Promise.allSettled([
            updateUserReputation(winnerId, 2),
            updateUserReputation(loserId, -3),
          ]),
        )
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
  const depositPct = escrowState?.securityDepositPct ?? 0n
  // Deposit fns revert at 0% (NoSecurityDepositRequired) or once done.
  const showBuyerDeposit =
    !!isBuyer && liveState === KlerosEscState.AWAITING_FUNDING &&
    depositPct > 0n &&
    !(escrowState?.buyerSecurityDeposited ?? false)
  // Seller: lock is available once the deposit is in (or immediately at
  // pct == 0); both buttons route through handleSellerFund.
  const showSellerDeposit =
    !!isSeller &&
    liveState === KlerosEscState.AWAITING_FUNDING &&
    depositPct > 0n &&
    !(escrowState?.sellerSecurityDeposited ?? false)
  const showSellerLock =
    !!isSeller &&
    liveState === KlerosEscState.AWAITING_FUNDING &&
    ((escrowState?.buyerSecurityDeposited ?? false) || depositPct === 0n) &&
    !(escrowState?.fundsLocked ?? false) &&
    (depositPct === 0n || (escrowState?.sellerSecurityDeposited ?? false))
  const showBuyerConfirm =
    !!isBuyer && liveState === KlerosEscState.FUNDED

  // Gate release() on the on-chain grace period (confirmationTime + gracePeriod).
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
  // raiseDispute is valid from FUNDED or CONFIRMED_PENDING inside the grace
  // window; after it closes the contract reverts DisputeWindowClosed.
  const disputeWindowClosed =
    liveState === KlerosEscState.CONFIRMED_PENDING &&
    gracePeriodElapsed === true
  const disputeActionAvailable =
    (liveState === KlerosEscState.FUNDED ||
      liveState === KlerosEscState.CONFIRMED_PENDING) &&
    (isBuyer || isSeller) &&
    !disputeWindowClosed
  // Dispute CTA is also gated on the factory-membership check.
  const showRaiseDispute = escrowVerified && disputeActionAvailable

  // Funding-phase timelock cancel (KlerosEsc.cancelTrade): own deposit in,
  // not locked/counter-deposited, 1 day elapsed. Button visibility is
  // best-effort; the contract reverts if the timelock hasn't elapsed.

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

  // Whether this wallet could act ignoring verification; drives the trust
  // warning (actions stay gated while unverified).
  const hasEscrowAction =
    showBuyerDeposit ||
    showSellerDeposit ||
    showSellerLock ||
    showBuyerConfirm ||
    showRelease ||
    showExecuteRuling ||
    showCancel ||
    disputeActionAvailable

  const handleCancelTrade = async () => {
    if (!escrowAddress) return
    if (!requireVerifiedEscrow()) return
    try {
      setTxStage('confirming')
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'cancelTrade',
      })
      setTxStage('mining')
      assertTxSuccess(await publicClient!.waitForTransactionReceipt({ hash: txHash }))
      // Mutual cancel: each party gets deposits back. Not a ruling — use
      // CANCELLED, not 'refunded' (which means a buyer-favorable payout).
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
  // Refresh state on escrow events without a manual reload; depend on the
  // primitive `tradeId` so refetches don't resubscribe the watcher and miss
  // events in the gap.
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
        // Mirror the transition so the trades list + dispute page update.
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
    [tradeId, refetchEscrow],
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

  // Rateable once terminal: on-chain COMPLETED, or DB completed/refunded
  // (buyer-favorable rulings never set the on-chain COMPLETED state).
  const tradeTerminal =
    trade?.status === 'completed' ||
    trade?.status === 'refunded' ||
    liveState === KlerosEscState.COMPLETED

  const showRatingForm =
    !!trade &&
    tradeTerminal &&
    isConnected && !!myId && !!myRole && !!ratedId

  const { data: hasRated = false } = useHasRated(
    showRatingForm ? trade?.id : undefined,
    myId,
  )

  const { data: tradeRatings = [] } = useTradeRatings(
    liveState === KlerosEscState.COMPLETED ? trade?.id : undefined,
  )

  // Conversation is created by the create_conversation_for_trade trigger.
  const { data: conversation } = useConversationByTradeId(
    trade?.id ?? null,
  )
  const messageCounterpart =
    !!trade && isConnected && !!conversation?.id
      ? `/app/messages/${conversation.id}`
      : null

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-10 text-muted-foreground">
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
      <ChainGuard />
      {/* Centered AppPageHeader (back left, title/subtitle centered). */}
      <AppPageHeader
        title={`${t('tradeDetail.trade')} ${trade.crypto_token}`}
        subtitle={
          <>
            {trade.crypto_amount} {trade.crypto_token} ·{' '}
            {currencySymbol(trade.fiat_currency)}
            {trade.fiat_amount} {trade.fiat_currency}
          </>
        }
        variant="centered"
        onBack={() => navigate(-1)}
      />

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
                Blockscan <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {escrowState && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                    {(Number(escrowState.securityDepositPct) / 100).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    {t('tradeDetail.gracePeriod')}
                  </Text>
                  <p className="font-mono">
                    {formatGracePeriod(escrowState.gracePeriod)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Grace-period info while CONFIRMED_PENDING, with countdown. */}
      {escrowState && liveState === KlerosEscState.CONFIRMED_PENDING && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            {t('tradeDetail.gracePeriod')}
          </Text>
          <Text variant="small" className="text-muted-foreground">
            {t('tradeDetail.gracePeriodBody', {
              defaultValue:
                "The grace period is a per-escrow delay, that starts when the buyer confirms the off-chain payment. During this window either party may raise a dispute; once it elapses without one, anyone can call release() to finalize the trade and pay out.",
            })}
          </Text>
          {graceEndSeconds != null && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Timer className="w-4 h-4 text-muted-foreground" />
              <span>
                {gracePeriodElapsed
                  ? t('tradeDetail.gracePeriodEnded', {
                      defaultValue: 'Grace period ended — release is now available.',
                    })
                  : t('tradeDetail.gracePeriodRemaining', {
                      time: formatDuration(
                        graceEndSeconds > nowSecsBig
                          ? graceEndSeconds - nowSecsBig
                          : 0n,
                      ),
                    })}
              </span>
            </div>
          )}
        </Card>
      )}

      {/* Funding progress */}
      {escrowState && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            {t('tradeDetail.funding')}
          </Text>

          <div className="space-y-3 text-sm">
            {depositPct > 0n && (
              <FundingRow
                label={t('tradeDetail.buyerDeposit', { amount: formatTokenAmount(escrowState.securityDepositAmount, decimals, symbol) })}
                done={escrowState.buyerSecurityDeposited}
                who="buyer"
                isMe={isBuyer}
                t={t}
              />
            )}
            <FundingRow
              label={t('tradeDetail.sellerLock', { amount: formatTokenAmount(escrowState.tradeAmount + escrowState.securityDepositAmount, decimals, symbol) })}
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

          {/* Unverified escrow → fund-moving CTAs disabled (handlers re-check). */}
          {!escrowVerified && hasEscrowAction && (
            <Alert className="mt-3 rounded-2xl">
              <ShieldAlert className="w-4 h-4" />
              <AlertDescription>
                {escrowVerifying
                  ? t('tradeDetail.escrowVerifying', {
                      defaultValue:
                        'Verifying the escrow contract against the configured factory…',
                    })
                  : t('tradeDetail.escrowUnverified', {
                      defaultValue:
                        'This escrow could not be verified against the configured factory for your connected wallet. Fund-moving actions are disabled to protect your funds.',
                    })}
              </AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-2">
            {showBuyerDeposit && (
              <Button
                onClick={handleBuyerDeposit}
                disabled={isTxBusy || !tokenAddress || !escrowVerified}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-2" />
                )}
                {isTxBusy
                  ? getTxLabel(t, txStage)
                  : buyerAllowanceReady
                    ? t('tradeDetail.sendDeposit')
                    : t('tradeDetail.approveAndPostDeposit')}
              </Button>
            )}

            {showSellerDeposit && (
              <Button
                onClick={handleSellerFund}
                disabled={isTxBusy || !tokenAddress || !escrowVerified}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Coins className="w-4 h-4 mr-2" />
                )}
                {isTxBusy
                  ? getTxLabel(t, txStage)
                  : sellerAllowanceReady
                    ? t('tradeDetail.sendDeposit')
                    : t('tradeDetail.approveAndPostDeposit')}
              </Button>
            )}

            {showSellerLock && (
              <Button
                onClick={handleSellerFund}
                disabled={isTxBusy || !escrowVerified}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Coins className="w-4 h-4 mr-2" />
                )}
                {isTxBusy
                  ? getTxLabel(t, txStage)
                  : sellerAllowanceReady
                    ? t('tradeDetail.lockFunds')
                    : t('tradeDetail.approveAndLock')}
              </Button>
            )}

            {showBuyerConfirm && (
              <Button
                onClick={handleConfirm}
                disabled={isTxBusy || !escrowVerified}
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
                disabled={isTxBusy || !escrowVerified}
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
                    time: formatDuration(
                      graceEndSeconds > nowSecsBig
                        ? graceEndSeconds - nowSecsBig
                        : 0n,
                    ),
                  })}
                </p>
              )}

            {showExecuteRuling && (
              <Button
                onClick={handleExecuteRuling}
                disabled={isTxBusy || !escrowVerified}
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
                disabled={isTxBusy || !escrowVerified}
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
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {done ? (
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        ) : (
          <Timer className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <span className="min-w-0">{label}</span>
        {isMe && (
          <span className="text-xs text-muted-foreground shrink-0">{t('tradeDetail.you')}</span>
        )}
      </div>
      <span
        className={`text-xs shrink-0 ${done ? 'text-success' : 'text-muted-foreground'}`}
      >
        {done ? (subDone ?? t('tradeDetail.done')) : t(`tradeDetail.waitingFor${who === 'buyer' ? 'Buyer' : 'Seller'}`)}
      </span>
    </div>
  )
}