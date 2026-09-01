import { useCallback, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ExternalLink,
  Image as ImageIcon,
  ShieldAlert,
  User,
  Wallet,
  Loader2,
  Gavel,
  Timer,
  Scale,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { formatEther, keccak256, toBytes, type Abi } from 'viem'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  KLEROS_ESC_ABI,
  KlerosEscState,
  type KlerosEscStateValue,
} from '@/lib/contracts'
import { useDispute, useEscrowState, useAppealInfo, useEscrowEventWatcher } from '@/hooks/useDisputes'
import {
  type DisputeEvidenceFile,
  EscrowStatus,
  mirrorDisputeToTrade,
  TradeEventType,
  updateDisputeOnChain,
  insertDisputeEvidence,
} from '@/lib/supabase'
import { uploadToIpfs } from '@/lib/ipfs'
import { errorMessage } from '@/lib/errorMessage'
import { explorerBase } from '@/lib/explorer'
import { DisputeStatus, TradeStatus } from '@/types/database'

type DisputeStatusValue =
  | 'open'
  | 'in_review'
  | 'escalated'
  | 'resolved'
  | 'closed'

function PulseRow({ className = '' }: { className?: string }) {
  return <div className={`h-3 rounded bg-muted/60 animate-pulse ${className}`} />
}

const STATUS_STYLES: Record<DisputeStatusValue, string> = {
  open: 'bg-primary text-primary-foreground',
  in_review: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  escalated: 'bg-orange-500/15 text-orange-600 dark:text-orange-300',
  resolved: 'bg-green-500/15 text-green-600 dark:text-green-300',
  closed: 'bg-muted text-muted-foreground',
}

const GATEWAY = (
  import.meta.env.VITE_IPFS_GATEWAY ?? 'https://ipfs.io/ipfs/'
).replace(/\/$/, '')

const ON_CHAIN_STATE_I18N: Record<number, string> = {
  [KlerosEscState.AWAITING_FUNDING]: 'disputeDetail.awaitingFunding',
  [KlerosEscState.FUNDED]: 'disputeDetail.funded',
  [KlerosEscState.CONFIRMED_PENDING]: 'disputeDetail.confirmedPending',
  [KlerosEscState.AWAITING_RULING]: 'disputeDetail.awaitingRuling',
  [KlerosEscState.RULING_RECEIVED]: 'disputeDetail.rulingReceived',
  [KlerosEscState.RULING_EXECUTED]: 'disputeDetail.rulingExecutedState',
  [KlerosEscState.COMPLETED]: 'disputeDetail.completed',
  [KlerosEscState.CANCELLED]: 'disputeDetail.cancelledState',
}

const RULING_I18N: Record<number, string> = {
  [0]: 'disputeDetail.refused',
  [1]: 'disputeDetail.buyerWinsPenalty',
  [2]: 'disputeDetail.sellerWinsPenalty',
  [3]: 'disputeDetail.buyerWinsReturn',
  [4]: 'disputeDetail.sellerWinsReturn',
}

const STATUS_LABEL_I18N: Record<DisputeStatusValue, string> = {
  open: 'disputeDetail.open',
  in_review: 'disputeDetail.inReview',
  escalated: 'disputeDetail.escalated',
  resolved: 'disputeDetail.resolved',
  closed: 'disputeDetail.closed',
}

interface ParsedDescription {
  userText: string
  escrowAddress: string | null
  txHash: string | null
  evidenceTxHash: string | null
  onChainDisputeId: string | null
  evidenceCid: string | null
  arbitrationFeeWei: string | null
  evidence: Array<{ cid: string; url: string; name: string; size: number }>
}

/** Split the dispute.description blob (user text + on-chain metadata) the
 *  DisputePage writes at creation. Tolerates the old format (no `--- on-chain ---`
 *  separator) so older rows still render. */
function parseDescription(raw: string | null | undefined): ParsedDescription {
  const empty: ParsedDescription = {
    userText: '',
    escrowAddress: null,
    txHash: null,
    evidenceTxHash: null,
    onChainDisputeId: null,
    evidenceCid: null,
    arbitrationFeeWei: null,
    evidence: [],
  }
  if (!raw) return empty

  const sep = '--- on-chain ---'
  const idx = raw.indexOf(sep)
  if (idx < 0) return { ...empty, userText: raw.trim() }

  const userText = raw.slice(0, idx).trim()
  const meta = raw.slice(idx + sep.length)

  const escrowMatch = meta.match(/escrow_address:\s*(0x[a-fA-F0-9]{40})/)
  const txMatch = meta.match(/tx_hash:\s*(0x[a-fA-F0-9]{64})/)
  const evTxMatch = meta.match(/tx_hash_evidence:\s*(0x[a-fA-F0-9]{64})/)
  const idMatch = meta.match(/kleros_dispute_id:\s*(\S+)/)
  const cidMatch = meta.match(/evidence_cid:\s*(\S+)/)
  const feeMatch = meta.match(/arbitration_fee_wei:\s*(\d+)/)
  const evMatch = meta.match(/evidence:\s*(\[[\s\S]*?\])(?:\n|$)/)

  let evidence: ParsedDescription['evidence'] = []
  if (evMatch) {
    try {
      evidence = JSON.parse(evMatch[1])
    } catch {
      evidence = []
    }
  }

  return {
    userText,
    escrowAddress: escrowMatch?.[1] ?? null,
    txHash: txMatch?.[1] ?? null,
    evidenceTxHash:
      evTxMatch?.[1] && !evTxMatch[1].includes('not submitted')
        ? evTxMatch[1]
        : null,
    onChainDisputeId:
      idMatch && idMatch[1] !== '(event not decoded)' ? idMatch[1] : null,
    evidenceCid: cidMatch?.[1] ?? null,
    arbitrationFeeWei: feeMatch?.[1] ?? null,
    evidence,
  }
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatAddress(addr: string | null | undefined) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function DisputeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data: dispute, isLoading, isError } = useDispute(id)
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending: isWritePending } = useWriteContract()

  const parsed = parseDescription(dispute?.description)
  // Prefer the new DB column (`escrow_address`), fall back to the description
  // blob for rows written before the column existed.
  const escrowAddress = (dispute?.escrow_address ?? parsed.escrowAddress ?? '') as
    | `0x${string}`
    | ''

  // Live chain reads. Both are disabled until we have an escrow address.
  const { data: escrowState, refetch: refetchEscrowState } = useEscrowState(
    escrowAddress || undefined,
  )

  // Subscribe to on-chain events for this escrow. The handler refreshes the
  // multicall AND writes the cached columns on `disputes.*` so the page
  // reflects state transitions without a manual reload (and the
  // `useEscrowEventWatcher` filter list matches what the server-side indexer
  // will eventually need).
  const handleEscrowEvent = useCallback(
    async (eventName: string, args: Record<string, unknown>) => {
      const disputed = dispute?.id
      if (!disputed) return
      // Read trade id lazily so we don't need the destructured `trade`
      // variable in scope here (declared below after the early returns).
      const tradeId =
        (dispute?.trade as null | { id?: string | null })?.id ?? null
      try {
        if (eventName === 'RulingReceived') {
          const ruling = Number((args.ruling as bigint | number | undefined) ?? 0)
          await updateDisputeOnChain(disputed, {
            escrowState: KlerosEscState.RULING_RECEIVED,
            onChainRuling: ruling,
            rulingReceivedTime: new Date().toISOString(),
          })
        } else if (eventName === 'RulingExecuted') {
          const ruling = Number((args.ruling as bigint | number | undefined) ?? 0)
          await updateDisputeOnChain(disputed, {
            escrowState: KlerosEscState.RULING_EXECUTED,
            klerosDisputeStatus: 2,
            onChainRuling: ruling,
          })
          if (tradeId) {
            const buyerWins =
              ruling === 1 || ruling === 3
            await mirrorDisputeToTrade(tradeId, {
              tradeStatus: buyerWins ? TradeStatus.REFUNDED : TradeStatus.COMPLETED,
              escrowStatus: buyerWins ? EscrowStatus.REFUNDED : EscrowStatus.RELEASED,
              txHash: '',
              escrowEventType: TradeEventType.RULING_EXECUTED,
            }).catch((err) => { console.warn('[DisputeDetailPage.tsx]', err); return undefined })
          }
        } else if (eventName === 'Finalized') {
          await updateDisputeOnChain(disputed, {
            escrowState: KlerosEscState.COMPLETED,
            status: DisputeStatus.RESOLVED,
            resolvedAt: new Date().toISOString(),
          })
        } else if (eventName === 'DisputeTimedOut') {
          const buyerWasDisputer = args.buyerWasDisputer as boolean | undefined
          const winner: 'buyer' | 'seller' = buyerWasDisputer ? 'seller' : 'buyer'
          await updateDisputeOnChain(disputed, {
            escrowState: KlerosEscState.COMPLETED,
            status: DisputeStatus.CLOSED,
            winner,
            resolvedAt: new Date().toISOString(),
          })
          // Mirror the timeout outcome to the linked trade (mirror was
          // missing — surfaces as `trades.status='disputed'` forever).
          if (tradeId) {
            await mirrorDisputeToTrade(tradeId, {
              tradeStatus:
                winner === 'seller'
                  ? TradeStatus.COMPLETED
                  : TradeStatus.REFUNDED,
              escrowStatus:
                winner === 'seller'
                  ? EscrowStatus.RELEASED
                  : EscrowStatus.REFUNDED,
              txHash: '',
              escrowEventType: TradeEventType.DISPUTE_TIMED_OUT,
            }).catch((err) => { console.warn('[DisputeDetailPage.tsx]', err); return undefined })
          }
        } else if (eventName === 'AppealFunded') {
          await updateDisputeOnChain(disputed, {
            escrowState: KlerosEscState.AWAITING_RULING,
            klerosDisputeStatus: 1,
            onChainRuling: null,
            status: DisputeStatus.ESCALATED,
            appealCount: (dispute?.appeal_count ?? 0) + 1,
            evidenceGroupId: (dispute?.evidence_group_id ?? 0) + 1,
          })
        } else if (eventName === 'Evidence') {
          // Best-effort: nothing to write beyond what `submitEvidence` tx did
          // on the chain; the dispute_evidence row was added by the page
          // that called submitEvidence (this page or DisputePage). Future
          // indexer will reconcile via the Evidence event topic.
        }
      } catch (err) {
        console.warn('[DisputeDetailPage.tsx] err:', err)
      } finally {
        if (
          eventName === 'RulingReceived' ||
          eventName === 'RulingExecuted' ||
          eventName === 'Finalized' ||
          eventName === 'AppealFunded' ||
          eventName === 'DisputeTimedOut'
        ) {
          refetchEscrowState()
        }
      }
    },
    // The dispute object refetches on every state transition, so reading
    // trade id lazily inside the callback (via dispute?.trade) keeps the
    // handler fresh without needing a destructured `trade` variable in
    // deps (which would TDZ because trade is declared below the early
    // returns).
     
    [dispute, refetchEscrowState],
  )
  useEscrowEventWatcher(escrowAddress || undefined, handleEscrowEvent)

  // Appeal data — only meaningful once a dispute is raised on Kleros.
  const { data: appealInfo } = useAppealInfo(
    escrowAddress || undefined,
    escrowState?.klerosDisputeID ?? null,
  )

  if (isLoading) {
    return (
      <div className="w-full max-w-xl mx-auto space-y-3">
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl space-y-4">
          <PulseRow className="w-1/3 h-5" />
          <PulseRow className="w-2/3" />
          <PulseRow className="w-full" />
          <PulseRow className="w-5/6" />
        </Card>
      </div>
    )
  }

  if (isError || !dispute) {
    return (
      <div className="w-full max-w-xl mx-auto">
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <ShieldAlert className="w-8 h-8 text-destructive" />
            <Text variant="h4">{t('disputeDetail.couldNotLoad')}</Text>
            <Text variant="muted">
              {t('disputeDetail.accessDenied')}
            </Text>
            <Button
              variant="outline"
              className="rounded-full shadow-none mt-2"
              onClick={() => navigate('/app/disputes')}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> {t('disputeDetail.backToDisputes')}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const status = dispute.status as DisputeStatusValue
  const trade = dispute.trade as null | {
    id: string
    trade_id: string
    crypto_token?: string
    crypto_amount?: number
    fiat_currency?: string
    fiat_amount?: number
    status?: string
    payment_method?: string
    escrow_status?: string
    escrow_contract_addr?: string | null
    buyer?: {
      wallet_address: string
      nickname?: string | null
      avatar_url?: string | null
    } | null
    seller?: {
      wallet_address: string
      nickname?: string | null
      avatar_url?: string | null
    } | null
  }
  const buyer = dispute.buyer as
    | {
        wallet_address: string
        nickname?: string | null
        avatar_url?: string | null
        verification_level?: string
      }
    | null
  const seller = dispute.seller as typeof buyer
  const evidenceRows = (dispute.evidence ?? []) as Array<{
  id: string
  submitted_by: 'buyer' | 'seller' | 'neutral'
  ipfs_cid: string
  ipfs_url: string
  keccak_bytes32: string | null
  tx_hash: string | null
  evidence_group_id: number | null
  submitted_at: string | null
}>

  // Resolve the on-chain ruling: prefer the cached column from DB, fall back
  // to the live escrow-state read.
  const onChainRuling =
    dispute.on_chain_ruling != null
      ? Number(dispute.on_chain_ruling)
      : escrowState?.currentRuling != null
        ? Number(escrowState.currentRuling)
        : null

  const liveEscrowStateValue: KlerosEscStateValue | null =
    escrowState?.state != null
      ? (escrowState.state as KlerosEscStateValue)
      : null

  // Whether the connected wallet can submit evidence: must be buyer or seller
  // (contract: `KlerosEsc.submitEvidence` reverts for anyone else). The
  // additional-evidence flow lives on the detail page so jurors see
  // post-appeal rounds on kleros.io.
  const canSubmitMoreEvidence =
    !!escrowAddress &&
    !!escrowState &&
    (liveEscrowStateValue === KlerosEscState.AWAITING_RULING ||
      liveEscrowStateValue === KlerosEscState.RULING_RECEIVED)

  const filerRole: 'buyer' | 'seller' | null = address && escrowState
    ? address.toLowerCase() === escrowState.buyer.toLowerCase()
      ? 'buyer'
      : address.toLowerCase() === escrowState.seller.toLowerCase()
        ? 'seller'
        : null
    : null

  const handleExecuteRuling = async () => {
    if (!escrowAddress || !publicClient) return
    try {
      const hash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'executeRuling',
      })
      await publicClient.waitForTransactionReceipt({ hash })
      // Mirror: state → RULING_EXECUTED, Kleros status → Solved (2), cache the
      // ruling. Dispute stays in_review until finalize() locks it.
      const ruling = escrowState?.currentRuling != null
        ? Number(escrowState.currentRuling)
        : null
      await updateDisputeOnChain(dispute.id, {
        escrowState: KlerosEscState.RULING_EXECUTED,
        klerosDisputeStatus: 2,
        onChainRuling: ruling,
      }).catch((err) => { console.warn('[DisputeDetailPage.tsx]', err) })
      // Mirror the trade payout (B-3, B-7): rulings 1/3 → buyer wins
      // (refund), 0/2/4 → seller wins (release).
      if (trade?.id && ruling != null) {
        const buyerWins = ruling === 1 || ruling === 3
        await mirrorDisputeToTrade(trade.id, {
          tradeStatus: buyerWins ? TradeStatus.REFUNDED : TradeStatus.COMPLETED,
          escrowStatus: buyerWins ? EscrowStatus.REFUNDED : EscrowStatus.RELEASED,
          txHash: hash,
          escrowEventType: TradeEventType.RULING_EXECUTED,
        }).catch((err) => { console.warn('[DisputeDetailPage.tsx]', err) })
      }
      toast.success(t('disputeDetail.rulingExecuted'))
      refetchEscrowState()
    } catch (err) {
      toast.error(errorMessage(err, 'disputeDetail', t, 'rulingExecutedError'))
    }
  }

  const handleFinalize = async () => {
    if (!escrowAddress || !publicClient) return
    try {
      const hash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'finalize',
      })
      await publicClient.waitForTransactionReceipt({ hash })
      // Mirror: state → COMPLETED, dispute → resolved with resolved_at.
      await updateDisputeOnChain(dispute.id, {
        escrowState: KlerosEscState.COMPLETED,
        status: DisputeStatus.RESOLVED,
        resolvedAt: new Date().toISOString(),
      }).catch((err) => { console.warn('[DisputeDetailPage.tsx]', err) })
      // Mirror the trade-side outcome at finalize time (B-7).
      if (trade?.id) {
        const ruling = escrowState?.currentRuling != null
          ? Number(escrowState.currentRuling)
          : null
        const buyerWins = ruling === 1 || ruling === 3
        await mirrorDisputeToTrade(trade.id, {
          tradeStatus: buyerWins ? TradeStatus.REFUNDED : TradeStatus.COMPLETED,
          escrowStatus: buyerWins ? EscrowStatus.REFUNDED : EscrowStatus.RELEASED,
          txHash: hash,
          escrowEventType: TradeEventType.DISPUTE_FINALIZED,
        }).catch((err) => { console.warn('[DisputeDetailPage.tsx]', err) })
      }
      toast.success(t('disputeDetail.escrowFinalized'))
      refetchEscrowState()
    } catch (err) {
      toast.error(errorMessage(err, 'disputeDetail', t, 'escrowFinalizedError'))
    }
  }

  const handleTimeoutDispute = async () => {
    if (!escrowAddress || !publicClient) return
    try {
      const hash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'timeoutDispute',
      })
      await publicClient.waitForTransactionReceipt({ hash })
      // Mirror: state → COMPLETED, dispute → closed (timeout is unilateral loss
      // for the disputer, not a Kleros-mediated resolution).
      await updateDisputeOnChain(dispute.id, {
        escrowState: KlerosEscState.COMPLETED,
        status: DisputeStatus.CLOSED,
        resolvedAt: new Date().toISOString(),
      }).catch((err) => { console.warn('[DisputeDetailPage.tsx]', err) })
      // Mirror the trade-side outcome (B-7): the disputer loses. Use
      // `escrowState.disputer` to determine the winner without re-reading.
      if (trade?.id && escrowState?.disputer) {
        const buyerWasDisputer =
          escrowState.disputer.toLowerCase() === escrowState.buyer.toLowerCase()
        const winner: 'buyer' | 'seller' = buyerWasDisputer ? 'seller' : 'buyer'
        await mirrorDisputeToTrade(trade.id, {
          tradeStatus:
            winner === 'seller'
              ? TradeStatus.COMPLETED
              : TradeStatus.REFUNDED,
          escrowStatus:
            winner === 'seller' ? EscrowStatus.RELEASED : EscrowStatus.REFUNDED,
          txHash: hash,
          escrowEventType: TradeEventType.DISPUTE_TIMED_OUT,
        }).catch((err) => { console.warn('[DisputeDetailPage.tsx]', err) })
      }
      toast.success(t('disputeDetail.disputeTimedOut'))
      refetchEscrowState()
    } catch (err) {
      toast.error(errorMessage(err, 'disputeDetail', t, 'disputeTimedOutError'))
    }
  }

  const canExecuteRuling =
    liveEscrowStateValue === KlerosEscState.RULING_RECEIVED
  const canFinalize =
    liveEscrowStateValue === KlerosEscState.RULING_EXECUTED
  // DISPUTE_TIMEOUT (30 days) check is best done in the contract; the UI just
  // exposes the button and surfaces a revert if too early.
  const canTimeout =
    liveEscrowStateValue === KlerosEscState.AWAITING_RULING ||
    liveEscrowStateValue === KlerosEscState.RULING_RECEIVED

  const handleAppeal = async () => {
    if (!escrowAddress || !publicClient || !appealInfo?.appealCostWei) return
    try {
      const hash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'appeal',
        value: appealInfo.appealCostWei,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      // Mirror: state moves back to AWAITING_RULING for the new round; mark
      // the dispute as escalated.
      await updateDisputeOnChain(dispute.id, {
        escrowState: KlerosEscState.AWAITING_RULING,
        klerosDisputeStatus: 1,
        onChainRuling: null,
        status: DisputeStatus.ESCALATED,
      }).catch((err) => { console.warn('[DisputeDetailPage.tsx]', err) })
      toast.success(t('disputeDetail.appealFunded'))
      refetchEscrowState()
    } catch (err) {
      toast.error(errorMessage(err, 'disputeDetail', t, 'appealFundedError'))
    }
  }
  const canAppeal = !!appealInfo?.appealable

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/app/disputes')}
          aria-label={t('disputeDetail.backToDisputes')}
          className="rounded-full"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Text
          variant="small"
          className="uppercase tracking-wider text-muted-foreground"
        >
          {dispute.dispute_id}
        </Text>
        <span
          className={`inline-flex items-center px-2 h-5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}
        >
          {t(STATUS_LABEL_I18N[status])}
        </span>
      </div>

      <Text as="h2" variant="h2" className="mb-1">
        {dispute.reason}
      </Text>
      <Text variant="muted">{t('disputeDetail.filedOn', { date: formatDateTime(dispute.created_at) })}</Text>

      {/* Escrow contract + live chain state */}
      {escrowAddress && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            {t('disputeDetail.escrowContract')}
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
                    {t('disputeDetail.buyer')}
                  </Text>
                  <p className="font-mono">{formatAddress(escrowState.buyer)}</p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    {t('disputeDetail.seller')}
                  </Text>
                  <p className="font-mono">{formatAddress(escrowState.seller)}</p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    {t('disputeDetail.tradeAmount')}
                  </Text>
                  <p className="font-mono">
                    {escrowState.tradeAmount.toString()}
                  </p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    {t('disputeDetail.klerosCourt')}
                  </Text>
                  <a
                    href={`${explorerBase.address}${escrowState.klerosCourt}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {formatAddress(escrowState.klerosCourt)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            {liveEscrowStateValue !== null && (
              <div className="flex items-center gap-2 text-sm pt-1">
                <Gavel className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{t('disputeDetail.onChainState')}</span>
                <span className="font-mono">
                  {t(ON_CHAIN_STATE_I18N[liveEscrowStateValue as keyof typeof ON_CHAIN_STATE_I18N])}
                </span>
                {escrowState?.klerosDisputeID != null &&
                  escrowState.klerosDisputeID > 0n && (
                    <span className="font-mono">
                      · Kleros dispute #{escrowState.klerosDisputeID.toString()}
                    </span>
                  )}
              </div>
            )}

            {onChainRuling != null && onChainRuling >= 0 && (
              <div className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm">
                <Text variant="small" className="text-muted-foreground mb-1">
                  {t('disputeDetail.klerosRuling')}
                </Text>
                <span className="font-mono">#{onChainRuling}</span>{' '}
                <span className="text-muted-foreground">—</span>{' '}
                <span>
                  {RULING_I18N[onChainRuling as keyof typeof RULING_I18N]
                    ? t(RULING_I18N[onChainRuling as keyof typeof RULING_I18N])
                    : t('disputeDetail.unknownRuling')}
                </span>
              </div>
            )}

            {/* On-chain actions the connected wallet can take. B-7: drop `isFiler` so
                any connected wallet can call executeRuling / finalize /
                timeoutDispute — they're permissionless on the contract
                (deliberate keeper-bot design). Only the appeal path remains
                buyer/seller-only because `appeal()` checks msg.sender. */}
            {isConnected && (canExecuteRuling || canFinalize || canTimeout || canAppeal) && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                {canExecuteRuling && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={isWritePending}
                    onClick={handleExecuteRuling}
                  >
                    {isWritePending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    ) : (
                      <Gavel className="w-3.5 h-3.5 mr-1" />
                    )}
                    {t('disputeDetail.executeRuling')}
                  </Button>
                )}
                {canAppeal && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={isWritePending}
                    onClick={handleAppeal}
                  >
                    {isWritePending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    ) : (
                      <Scale className="w-3.5 h-3.5 mr-1" />
                    )}
                    {t('disputeDetail.appeal')}
                    {appealInfo?.appealCostWei != null && (
                      <span className="font-mono text-xs ml-1 text-muted-foreground">
                        ({formatEther(appealInfo.appealCostWei)} ETH)
                      </span>
                    )}
                  </Button>
                )}
                {canFinalize && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={isWritePending}
                    onClick={handleFinalize}
                  >
                    {t('disputeDetail.finalizeEscrow')}
                  </Button>
                )}
                {canTimeout && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={isWritePending}
                    onClick={handleTimeoutDispute}
                  >
                    <Timer className="w-3.5 h-3.5 mr-1" />
                    {t('disputeDetail.timeoutDispute')}
                  </Button>
                )}
              </div>
            )}
            {/* "Submit additional evidence" — buyer/seller only (enforced by
                 the contract). On click: uploads file to IPFS, calls
                 KlerosEsc.submitEvidence(bytes32(keccak256(cid))) on-chain,
                 and writes a dispute_evidence row linked to the current
                 evidence_group_id so jurors see post-appeal rounds. */}
            {isConnected && filerRole && canSubmitMoreEvidence && (
              <SubmitMoreEvidence
                escrowAddress={escrowAddress}
                evidenceGroupId={escrowState?.evidenceGroupID ?? 0}
                disputeId={dispute.id}
                filerRole={filerRole}
              />
            )}
          </div>
        </Card>
      )}

      {/* Trade (kept for back-compat with the Supabase trade join) */}
      {trade && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            {t('disputeDetail.linkedTrade')}
          </Text>

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <Text variant="small" className="font-mono truncate">
                  {trade.trade_id}
                </Text>
                <Text variant="muted" className="text-xs">
                  {trade.status ?? '—'} · escrow {trade.escrow_status ?? '—'}
                </Text>
              </div>
              {trade.crypto_token && (
                <Text variant="small" className="font-mono shrink-0">
                  {trade.crypto_amount} {trade.crypto_token}
                </Text>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <Label className="text-base font-semibold mb-2 block">{t('disputeDetail.buyer')}</Label>
                <p className="font-mono text-sm">
                  {formatAddress(trade.buyer?.wallet_address ?? buyer?.wallet_address)}
                </p>
                {(trade.buyer?.nickname ?? buyer?.nickname) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <User className="w-3 h-3" />
                    {trade.buyer?.nickname ?? buyer?.nickname}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-base font-semibold mb-2 block">{t('disputeDetail.seller')}</Label>
                <p className="font-mono text-sm">
                  {formatAddress(trade.seller?.wallet_address ?? seller?.wallet_address)}
                </p>
                {(trade.seller?.nickname ?? seller?.nickname) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <User className="w-3 h-3" />
                    {trade.seller?.nickname ?? seller?.nickname}
                  </p>
                )}
              </div>
            </div>

            {trade.fiat_amount != null && trade.fiat_currency && (
              <div className="flex justify-between text-sm pt-1">
                <span className="text-muted-foreground">{t('disputeDetail.tradeValue')}</span>
                <span className="font-mono">
                  {trade.fiat_amount} {trade.fiat_currency}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Description (user text only) */}
      {parsed.userText && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            {t('disputeDetail.filersAccount')}
          </Text>
          <p className="text-sm whitespace-pre-wrap leading-7">
            {parsed.userText}
          </p>
        </Card>
      )}

      {/* Evidence (images from IPFS) */}
      {parsed.evidence.length > 0 && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            {t('disputeDetail.proof')}
          </Text>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {parsed.evidence.map((e, i) => (
              <a
                key={`${e.cid}-${i}`}
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <div className="rounded-xl overflow-hidden border border-border bg-background/60 aspect-square">
                  <img
                    src={`${GATEWAY}/${e.cid}`}
                    alt={e.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                  />
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{e.name}</span>
                  <span className="shrink-0">· {bytes(e.size)}</span>
                </p>
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* On-chain transactions (tx hashes from the description blob) */}
      {(parsed.txHash || parsed.evidenceTxHash || parsed.onChainDisputeId || parsed.evidenceCid) && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            {t('disputeDetail.onChain')}
          </Text>

          <div className="space-y-3">
            {parsed.txHash && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t('disputeDetail.raiseDisputeTx')}</span>
                <a
                  href={`${explorerBase.tx}${parsed.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary hover:underline inline-flex items-center gap-1"
                >
                  {parsed.txHash.slice(0, 10)}…{parsed.txHash.slice(-6)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {parsed.evidenceTxHash && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t('disputeDetail.submitEvidenceTx')}</span>
                <a
                  href={`${explorerBase.tx}${parsed.evidenceTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary hover:underline inline-flex items-center gap-1"
                >
                  {parsed.evidenceTxHash.slice(0, 10)}…{parsed.evidenceTxHash.slice(-6)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {parsed.onChainDisputeId && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t('disputeDetail.klerosDisputeId')}</span>
                <span className="font-mono">#{parsed.onChainDisputeId}</span>
              </div>
            )}
            {parsed.evidenceCid && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t('disputeDetail.evidenceCid')}</span>
                <a
                  href={`${GATEWAY}/${parsed.evidenceCid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary hover:underline inline-flex items-center gap-1 truncate"
                >
                  {parsed.evidenceCid.slice(0, 10)}…{parsed.evidenceCid.slice(-4)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {parsed.arbitrationFeeWei && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t('disputeDetail.arbitrationFee')}</span>
                <span className="font-mono">
                  {formatEther(BigInt(parsed.arbitrationFeeWei))} ETH
                </span>
              </div>
            )}
            <Separator />
            <Text variant="muted" className="text-xs">
              {t('disputeDetail.onChainDisclaimer')}
            </Text>
          </div>
        </Card>
      )}

      {/* Evidence from dispute_evidence table. Renamed columns in
          migration 20260824*: `ipfs_cid` (was `file_hash`), `ipfs_url` (was
          `file_encrypted`), with new `keccak_bytes32` + `tx_hash` +
          `evidence_group_id` for round-aware display. */}
      {evidenceRows.length > 0 && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            {t('disputeDetail.legacyEvidence')}
          </Text>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {evidenceRows.map((row) => {
              const src = row.ipfs_url || (row.ipfs_cid ? `${GATEWAY}/${row.ipfs_cid}` : null)
              return (
                <div
                  key={row.id}
                  className="rounded-xl overflow-hidden border border-border bg-background/60"
                >
                  {src ? (
                    <a
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      <div className="aspect-square">
                        <img
                          src={src}
                          alt={row.submitted_by ?? 'evidence'}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                        />
                      </div>
                    </a>
                  ) : (
                    <div className="flex items-center justify-center aspect-square text-muted-foreground">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
                    <span className="text-muted-foreground capitalize shrink-0">
                      {row.submitted_by ?? 'unknown'}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {t('disputeDetail.evidenceRound', { n: Number(row.evidence_group_id ?? 0) })}
                    </span>
                    {row.tx_hash && (
                      <a
                        href={`${explorerBase.tx}${row.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-0.5 shrink-0"
                      >
                        tx
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <span className="text-muted-foreground ml-auto truncate">
                      {formatDateTime(row.submitted_at)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Wallet-not-connected banner when an action is otherwise available. */}
      {isConnected === false && escrowAddress && (
        <Alert className="mt-3 rounded-2xl">
          <Wallet className="w-4 h-4" />
          <AlertDescription>
            {t('disputeDetail.connectWalletDescription')}
          </AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button
          variant="outline"
          className="rounded-full shadow-none"
          onClick={() => navigate('/app/disputes')}
        >
          {t('disputeDetail.backToDisputesButton')}
        </Button>
      </div>
    </div>
  )
}

/**
 * "Submit additional evidence" affordance shown on `DisputeDetailPage` so
 * buyers/sellers can pin post-appeal rounds to the chain (`KlerosEsc.sol:611`).
 * Each file → one IPFS upload → one `submitEvidence(bytes32)` tx → one
 * `dispute_evidence` row tagged with the current `evidence_group_id`.
 *
 * B-5: used to be hidden (DisputePage raised only the first CID on-chain).
 */
function SubmitMoreEvidence({
  escrowAddress,
  evidenceGroupId,
  disputeId,
  filerRole,
}: {
  escrowAddress: `0x${string}` | null
  evidenceGroupId: bigint
  disputeId: string
  filerRole: 'buyer' | 'seller'
}) {
  const { t } = useTranslation()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !escrowAddress || !publicClient) return
    setBusy(true)
    try {
      const upload = await uploadToIpfs(file)
      const evidenceBytes32 = keccak256(toBytes(upload.cid)) as `0x${string}`
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'submitEvidence',
        args: [evidenceBytes32],
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      const rows: DisputeEvidenceFile[] = [
        {
          cid: upload.cid,
          url: upload.url,
          name: upload.name ?? file.name,
          size: upload.size ?? file.size,
          kind: file.type.split('/')[1] ?? 'image',
          keccakBytes32: evidenceBytes32,
          txHash,
          evidenceGroupId: Number(evidenceGroupId),
        },
      ]
      await insertDisputeEvidence(disputeId, rows, filerRole, Number(evidenceGroupId))
      toast.success(t('disputeDetail.evidenceSubmittedSuccess'))
    } catch (err) {
      toast.error(errorMessage(err, 'disputeDetail', t, 'evidenceSubmittedError'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
      <Label className="text-sm font-medium">
        {t('disputeDetail.submitMoreEvidence')}
      </Label>
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={onPick}
        />
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={busy || isPending}
          onClick={() => fileRef.current?.click()}
        >
          {busy || isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
          ) : (
            <UploadCloud className="w-3.5 h-3.5 mr-1" />
          )}
          {busy || isPending ? t('disputeDetail.submittingEvidence') : t('disputeDetail.submitEvidence')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t('disputeDetail.evidenceRound', { n: Number(evidenceGroupId) })}
        </span>
      </div>
    </div>
  )
}