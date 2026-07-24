import { useNavigate, useParams } from 'react-router-dom'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { formatEther, type Abi } from 'viem'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  KLEROS_ESC_ABI,
  KlerosEscState,
  KlerosEscStateLabel,
  RULING_LABEL,
  type RulingValue,
} from '@/lib/contracts'
import { useDispute, useEscrowState } from '@/hooks/useDisputes'

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

const STATUS_LABEL: Record<DisputeStatusValue, string> = {
  open: 'Open',
  in_review: 'In Review',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
}

const GATEWAY = (
  import.meta.env.VITE_IPFS_GATEWAY ?? 'https://ipfs.io/ipfs/'
).replace(/\/$/, '')

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

  const isFiler = isConnected && address && escrowState
    ? address.toLowerCase() === escrowState.buyer.toLowerCase() ||
      address.toLowerCase() === escrowState.seller.toLowerCase()
    : false

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
            <Text variant="h4">Couldn’t load this dispute</Text>
            <Text variant="muted">
              It may have been removed or you don’t have access.
            </Text>
            <Button
              variant="outline"
              className="rounded-full shadow-none mt-2"
              onClick={() => navigate('/app/disputes')}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to disputes
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const status = dispute.status as DisputeStatusValue
  const trade = dispute.trade as null | {
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
  const evidenceRows = dispute.evidence as Array<Record<string, unknown>> | null

  // Resolve the on-chain ruling: prefer the cached column from DB, fall back
  // to the live escrow-state read.
  const onChainRuling =
    dispute.on_chain_ruling != null
      ? Number(dispute.on_chain_ruling)
      : escrowState?.currentRuling != null
        ? Number(escrowState.currentRuling)
        : null

  const liveEscrowStateValue =
    escrowState?.state != null
      ? (Number(escrowState.state) as keyof typeof KlerosEscState)
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
      toast.success('Ruling executed — funds distributed per Kleros.')
      refetchEscrowState()
    } catch (err) {
      toast.error('Execute ruling failed: ' + (err as Error).message)
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
      toast.success('Escrow finalized.')
      refetchEscrowState()
    } catch (err) {
      toast.error('Finalize failed: ' + (err as Error).message)
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
      toast.success('Dispute timed out — default rule applied.')
      refetchEscrowState()
    } catch (err) {
      toast.error('Timeout failed: ' + (err as Error).message)
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

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/app/disputes')}
          aria-label="Back to disputes"
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
          {STATUS_LABEL[status]}
        </span>
      </div>

      <Text as="h2" variant="h2" className="mb-1">
        {dispute.reason}
      </Text>
      <Text variant="muted">Filed {formatDateTime(dispute.created_at)}</Text>

      {/* Escrow contract + live chain state */}
      {escrowAddress && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            Escrow contract
          </Text>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <code className="font-mono text-xs break-all">
                {escrowAddress}
              </code>
              <a
                href={`https://etherscan.io/address/${escrowAddress}`}
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
                    Buyer
                  </Text>
                  <p className="font-mono">{formatAddress(escrowState.buyer)}</p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    Seller
                  </Text>
                  <p className="font-mono">{formatAddress(escrowState.seller)}</p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    Trade amount
                  </Text>
                  <p className="font-mono">
                    {escrowState.tradeAmount.toString()}
                  </p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    Kleros court
                  </Text>
                  <a
                    href={`https://etherscan.io/address/${escrowState.klerosCourt}`}
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
                <span className="text-muted-foreground">On-chain state:</span>
                <span className="font-mono">
                  {KlerosEscStateLabel[liveEscrowStateValue as keyof typeof KlerosEscStateLabel]}
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
                  Kleros ruling
                </Text>
                <span className="font-mono">#{onChainRuling}</span>{' '}
                <span className="text-muted-foreground">—</span>{' '}
                <span>
                  {RULING_LABEL[onChainRuling as RulingValue] ??
                    'Unknown ruling'}
                </span>
              </div>
            )}

            {/* On-chain actions the connected wallet can take. */}
            {isConnected && isFiler && (canExecuteRuling || canFinalize || canTimeout) && (
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
                    Execute ruling
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
                    Finalize escrow
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
                    Timeout dispute (30d)
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Trade (kept for back-compat with the Supabase trade join) */}
      {trade && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            Linked trade
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
                <Label className="text-base font-semibold mb-2 block">Buyer</Label>
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
                <Label className="text-base font-semibold mb-2 block">Seller</Label>
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
                <span className="text-muted-foreground">Trade value</span>
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
            Filer’s account
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
            Proof
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
            On-chain
          </Text>

          <div className="space-y-3">
            {parsed.txHash && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">raiseDispute tx</span>
                <a
                  href={`https://etherscan.io/tx/${parsed.txHash}`}
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
                <span className="text-muted-foreground">submitEvidence tx</span>
                <a
                  href={`https://etherscan.io/tx/${parsed.evidenceTxHash}`}
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
                <span className="text-muted-foreground">Kleros dispute id</span>
                <span className="font-mono">#{parsed.onChainDisputeId}</span>
              </div>
            )}
            {parsed.evidenceCid && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Evidence CID</span>
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
                <span className="text-muted-foreground">Arbitration fee</span>
                <span className="font-mono">
                  {formatEther(BigInt(parsed.arbitrationFeeWei))} ETH
                </span>
              </div>
            )}
            <Separator />
            <Text variant="muted" className="text-xs">
              The KlerosEsc clone and Kleros court are the source of truth. The
              Supabase row mirrors the on-chain state for fast listing and to
              store IPFS CIDs that don't fit on-chain.
            </Text>
          </div>
        </Card>
      )}

      {/* Evidence from dispute_evidence table (legacy / when present) */}
      {evidenceRows && evidenceRows.length > 0 && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            Submitted evidence (legacy table)
          </Text>
          <ul className="space-y-2">
            {evidenceRows.map((row, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-sm rounded-lg border border-border bg-background/60 px-3 py-2"
              >
                <span className="text-muted-foreground text-xs">
                  {String(row.submitted_by ?? 'unknown')}
                </span>
                <span className="font-mono truncate flex-1">
                  {String(row.file_hash ?? '').slice(0, 18)}…
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(row.submitted_at as string)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Wallet-not-connected banner when an action is otherwise available. */}
      {isConnected === false && escrowAddress && (
        <Alert className="mt-3 rounded-2xl">
          <Wallet className="w-4 h-4" />
          <AlertDescription>
            Connect the buyer or seller wallet to interact with this dispute.
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
          Back to disputes
        </Button>
      </div>
    </div>
  )
}