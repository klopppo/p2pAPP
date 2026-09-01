import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { parseEventLogs, formatEther, type Abi } from 'viem'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { FullDropdown } from '@/components/custom/FullDropdown'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  UploadCloud,
  X,
  Image as ImageIcon,
  ShieldAlert,
  AlertTriangle,
  Wallet,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { uploadToIpfs } from '@/lib/ipfs'
import {
  KLEROS_ESC_ABI,
  KLEROS_ESC_EVENTS_ABI,
  KLEROS_ESCROW_FACTORY_ADDRESS,
  KlerosEscState,
  SEVERITY_TO_APPLEVEL,
  isFactoryConfigured,
  type SeverityLabel,
} from '@/lib/contracts'
import {
  createDispute,
  generateDisputeId,
  ensureUser,
  getTradeByEscrowAddress,
  insertDisputeEvidence,
  updateDisputeOnChain,
  updateTradeStatus,
  type DisputeEvidenceFile,
} from '@/lib/supabase'
import { useUserEscrows, useArbitrationCost, useEscrowState } from '@/hooks/useDisputes'
import { DisputeStatus, TradeEventType } from '@/types/database'
import { errorMessage } from '@/lib/errorMessage'

interface UploadedFile {
  file: File
  name: string
  size: number
  type: string
  previewUrl: string
}

const MAX_FILE_MB = 10
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/heic'

type Stage =
  | 'idle'
  | 'fetching-fee'
  | 'uploading'
  | 'raising'
  | 'mining'
  | 'submitting-evidence'
  | 'saving'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Convert an IPFS CID (string) to a bytes32 that KlerosEsc.submitEvidence accepts.
 *  Uses keccak256 for collision-resistance; the CID is also stored in the
 *  Supabase row for off-chain display.
 */
async function cidToBytes32(cid: string): Promise<`0x${string}`> {
  const { keccak256, toBytes } = await import('viem')
  return keccak256(toBytes(cid))
}

export function DisputePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  // Stable short codes for `disputes.reason` (varchar(200) — keep under the
  // limit). `reason_category` carries the full localized label. Codes mirror
  // what the relational-schema doc calls `dispute_category` enum values.
  const DISPUTE_REASONS = useMemo(
    () => [
      { value: 'no_payment', label: t('disputePage.reasonNoPayment') },
      { value: 'payment_released', label: t('disputePage.reasonPaymentReleased') },
      { value: 'unresponsive', label: t('disputePage.reasonUnresponsive') },
      { value: 'wrong_amount', label: t('disputePage.reasonWrongAmount') },
      { value: 'fraud', label: t('disputePage.reasonFraud') },
      { value: 'other', label: t('disputePage.reasonOther') },
    ],
    [t],
  )

  const SEVERITY = useMemo<SeverityLabel[]>(
    () => [
      t('disputePage.severityLow') as SeverityLabel,
      t('disputePage.severityMedium') as SeverityLabel,
      t('disputePage.severityHigh') as SeverityLabel,
      t('disputePage.severityCritical') as SeverityLabel,
    ],
    [t],
  )

  const STAGE_LABEL = useMemo<Record<Stage, string>>(
    () => ({
      idle: t('disputePage.fileDispute'),
      'fetching-fee': t('disputePage.stageFetchingFee'),
      uploading: t('disputePage.stageUploading'),
      raising: t('disputePage.stageRaising'),
      mining: t('disputePage.stageMining'),
      'submitting-evidence': t('disputePage.stageSubmittingEvidence'),
      saving: t('disputePage.stageSaving'),
    }),
    [t],
  )

  // When the user lands here from a trade detail page, the route carries
  // ?tradeId=<id> (which encodes the escrow contract address — see
  // TradeDetailPage's "Raise a Kleros dispute" link). We auto-select that
  // escrow once the user's escrows load.
  const queryEscrow = searchParams.get('escrowAddress') as `0x${string}` | null

  const [escrowAddress, setEscrowAddress] = useState<`0x${string}` | ''>('')
  const [reason, setReason] = useState(DISPUTE_REASONS[0].value)
  const [severity, setSeverity] = useState<SeverityLabel>(SEVERITY[1])
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')

  const isSubmitting = stage !== 'idle'
  const factoryReady = isFactoryConfigured()

  const { data: userEscrows = [], isLoading: escrowsLoading } = useUserEscrows()
  // Derived: if the user hasn't picked one yet, fall back to a `?escrowAddress=`
// query param (when arriving from a TradeDetailPage link), then to the first
// escrow in their list. The arbitration-cost hook + dropdown both consume
// `effectiveEscrow`; no separate effect needed.
const effectiveEscrow =
    escrowAddress || queryEscrow || userEscrows[0] || ''
  const { data: arbitrationCostWei } = useArbitrationCost(
    effectiveEscrow || undefined,
  )

  // Build a label per escrow (address + truncated address). Real apps would
  // join the on-chain tradeAmount/buyer/seller into a friendlier label.
  const escrowOptions = useMemo(
    () =>
      userEscrows.map((addr) => ({
        value: addr,
        label: `${addr.slice(0, 8)}…${addr.slice(-6)}`,
      })),
    [userEscrows],
  )

  // B-4: read the escrow state to determine the filer's role
  // (buyer vs seller). Previously this defaulted to 'buyer' in
  // `insertDisputeEvidence`, mis-tagging seller-raised disputes.
  const { data: escrowState } = useEscrowState(
    effectiveEscrow || undefined,
  )
  const filerRole: 'buyer' | 'seller' | null =
    !!address && !!escrowState
      ? address.toLowerCase() === escrowState.buyer.toLowerCase()
        ? 'buyer'
        : address.toLowerCase() === escrowState.seller.toLowerCase()
          ? 'seller'
          : null
      : null

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const accepted: UploadedFile[] = []
    Array.from(incoming).forEach((f) => {
      if (!f.type.startsWith('image/')) return
      if (f.size > MAX_FILE_MB * 1024 * 1024) return
      accepted.push({
        file: f,
        name: f.name,
        size: f.size,
        type: f.type,
        previewUrl: URL.createObjectURL(f),
      })
    })
    setFiles((prev) => {
      const merged = [...prev]
      accepted.forEach((a) => {
        if (!merged.some((m) => m.name === a.name && m.size === a.size)) {
          merged.push(a)
        }
      })
      return merged
    })
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  const removeFile = (idx: number) =>
    setFiles((prev) => {
      const removed = prev[idx]
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, i) => i !== idx)
    })

  const handleReset = () => {
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    setEscrowAddress('')
    setReason(DISPUTE_REASONS[0].value)
    setSeverity(SEVERITY[1])
    setDescription('')
    setFiles([])
    setAgreed(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed || isSubmitting) return

    if (!isConnected || !address) {
      toast.error(t('disputePage.errorConnectWallet'))
      return
    }
    if (!factoryReady || !effectiveEscrow) {
      toast.error(
        !factoryReady
          ? t('disputePage.factoryNotConfigured')
          : t('disputePage.errorPickEscrow'),
      )
      return
    }
    if (files.length === 0) {
      toast.error(t('disputePage.errorUploadProof'))
      return
    }
    if (!publicClient) {
      toast.error(t('disputePage.errorRpcClient'))
      return
    }
    if (arbitrationCostWei == null) {
      toast.error(t('disputePage.errorArbitrationFee'))
      return
    }

    setStage('uploading')
    try {
      // 1) Upload proof pictures to IPFS — the FIRST CID becomes the
      //    on-chain evidence reference passed to submitEvidence().
      const uploads = await Promise.all(files.map((f) => uploadToIpfs(f.file)))
      const primaryCid = uploads[0].cid
      const evidenceBytes32 = await cidToBytes32(primaryCid)

      // 2) Resolve the filer's Supabase user id (create-if-missing) so the DB
      //    row satisfies the foreign key on disputes.buyer_id.
      const me = await ensureUser(address)
      if (!me) {
        toast.error(t('disputePage.errorConnectWallet'))
        setStage('idle')
        return
      }

      // 2b) Resolve the linked trade (escrow address → trades.escrow_contract_addr)
      //     so the dispute references the real trade uuid and the actual
      //     counterparty — not the filer twice, and not a 0x address in a
      //     uuid FK column.
      const linkedTrade = await getTradeByEscrowAddress(effectiveEscrow)
      if (!linkedTrade) {
        toast.error(
          t('disputePage.errorNoTrade'),
        )
        throw new Error(`No trade linked to escrow ${effectiveEscrow}`)
      }

      // 3) Raise the dispute on-chain. raiseDispute() forwards ETH to the
      //    Kleros court internally; we only need to attach the fee.
      setStage('raising')
      const txHash = await writeContractAsync({
        address: effectiveEscrow,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'raiseDispute',
        value: arbitrationCostWei,
      })

      // 4) Wait for inclusion + decode the on-chain Kleros dispute ID assigned
      //    by KlerosCourt.createDispute() (via the DisputeRaised event).
      setStage('mining')
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      })
      let klerosDisputeId: string | null = null
      try {
        const logs = parseEventLogs({
          abi: KLEROS_ESC_EVENTS_ABI as Abi,
          eventName: 'DisputeRaised',
          logs: receipt.logs,
        })
        const args = logs[0]?.args as
          | { klerosDisputeID?: bigint }
          | undefined
        if (args?.klerosDisputeID !== undefined) {
          klerosDisputeId = args.klerosDisputeID.toString()
        }
      } catch (decodeErr) {
      console.warn('[DisputePage.tsx] decodeErr:', decodeErr);/* swallow */ }

      // 5) Submit the IPFS evidence bytes32 on-chain (ERC-1497 Evidence event).
      //    Buyer or seller only — enforced by the contract. May also be called
      //    later by either party via the detail page.
      setStage('submitting-evidence')
      let evidenceTxHash: `0x${string}` | null = null
      try {
        evidenceTxHash = await writeContractAsync({
          address: effectiveEscrow,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: 'submitEvidence',
          args: [evidenceBytes32],
        })
        await publicClient.waitForTransactionReceipt({ hash: evidenceTxHash })
      } catch (_evidenceErr) {
        // The dispute itself is raised; evidence submission is best-effort
        // and can be retried from the detail page. Don't fail the whole flow.
        toast.warning(
          t('disputePage.warningEvidenceFailed'),
        )
      }

      // 6) Persist the dispute to Supabase with on-chain metadata.
      setStage('saving')
      const dispute = await createDispute({
        dispute_id: generateDisputeId(),
        trade_id: linkedTrade.id,
        buyer_id: linkedTrade.buyer_id,
        seller_id: linkedTrade.seller_id,
        reason,
        reason_category: DISPUTE_REASONS.find((r) => r.value === reason)?.label ?? reason,
        description: [
          description,
          `--- on-chain ---`,
          `escrow_address: ${effectiveEscrow}`,
          `kleros_dispute_id: ${klerosDisputeId ?? '(event not decoded)'}`,
          `tx_hash: ${txHash}`,
          `tx_hash_evidence: ${evidenceTxHash ?? '(not submitted)'}`,
          `arbitration_fee_wei: ${arbitrationCostWei.toString()}`,
          `severity: ${SEVERITY_TO_APPLEVEL[severity]} (${severity})`,
          `evidence_cid: ${primaryCid}`,
        ].join('\n\n'),
        can_appeal: true,
        appeal_deadline: null,
        escrow_address: effectiveEscrow,
        kleros_dispute_id: klerosDisputeId,
        tx_hash: txHash,
        tx_hash_evidence: evidenceTxHash,
        evidence_cid: primaryCid,
        escrow_state: KlerosEscState.AWAITING_RULING,
        // B-9: start at IN_REVIEW so the `DisputesListPage` "In review"
        // filter surfaces this dispute immediately (instead of leaving it
        // stuck at 'open' until someone visits the detail page).
        status: DisputeStatus.IN_REVIEW,
        evidence_group_id: 0,
        appeal_count: 0,
        raiser: filerRole ?? undefined,
        fee_paid_wei: arbitrationCostWei.toString(),
        dispute_timestamp: new Date().toISOString(),
      })

      // 6a) Persist each uploaded file as a dispute_evidence row. Best-effort —
      //     the dispute row + on-chain submitEvidence() are the source of truth;
      //     these rows back the gallery on the detail page. B-4: pass the
      //     filer role explicitly (sellers raising a dispute are not 'buyer').
      //     Each row carries the per-file keccak + on-chain tx hash so the
      //     detail-page "legacy evidence" list can deep-link to Etherscan.
      const primaryKeccak = await cidToBytes32(uploads[0].cid)
      const evidenceFiles: DisputeEvidenceFile[] = uploads.map((u, idx) => ({
        cid: u.cid,
        url: u.url,
        name: u.name,
        size: u.size,
        // Only the first file was sent on-chain; remaining rows are
        // Supabase-only and carry keccakBytes32=null so future indexer
        // doesn't claim they're on-chain.
        keccakBytes32: idx === 0 ? primaryKeccak : null,
        txHash: idx === 0 ? evidenceTxHash : null,
        evidenceGroupId: 0,
      }))
      await insertDisputeEvidence(
        dispute.id,
        evidenceFiles,
        filerRole ?? 'neutral',
        0,
      ).catch((insertErr) => {
        console.warn('[DisputePage] insertDisputeEvidence failed:', insertErr)
      })

      // B-9 (belt-and-braces) — also bump via updateDisputeOnChain in case
      // an older DB doesn't support the status-on-create path.
      await updateDisputeOnChain(dispute.id, {
        status: DisputeStatus.IN_REVIEW,
        evidenceGroupId: 0,
        appealCount: 0,
      }).catch((err) => { console.warn('[DisputePage.tsx]', err); return undefined })

      // 6b) Mirror the trade into `disputed` so the trades list stops showing
      //     it as a funding/active trade. Non-fatal — the dispute row is the
      //     source of truth for listing.
      await updateTradeStatus(linkedTrade.id, 'disputed', {
        escrowStatus: 'disputed',
        txHash,
        escrowEventType: TradeEventType.ESCROW_DISPUTED,
      }).catch((err) => { console.warn('[DisputePage.tsx]', err); /* non-fatal — the dispute row already landed */
      })

      toast.success(t('disputePage.successFiled'))
      navigate(`/app/disputes/${dispute.id}`)
    } catch (err) {
      toast.error(errorMessage(err, 'disputePage', t))
    } finally {
      setStage('idle')
    }
  }

  const arbitrationCostEth = arbitrationCostWei
    ? formatEther(arbitrationCostWei)
    : null

  const canSubmit =
    agreed &&
    effectiveEscrow &&
    files.length > 0 &&
    arbitrationCostWei != null &&
    !isSubmitting

  return (
    <div className="w-full max-w-xl mx-auto">
      <AppPageHeader
        title={t('disputePage.title')}
        subtitle={t('disputePage.subtitle')}
        variant="centered"
        onBack={() => navigate(-1)}
      />

      {/* Wallet + factory readiness hints. */}
      {!isConnected && (
        <Alert className="mb-3 rounded-2xl">
          <Wallet className="w-4 h-4" />
          <AlertDescription>
            {t('disputePage.connectWallet')}
          </AlertDescription>
        </Alert>
      )}
      {isConnected && !factoryReady && (
        <Alert className="mb-3 rounded-2xl border-destructive/40 text-destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            {t('disputePage.factoryNotConfigured')}
          </AlertDescription>
        </Alert>
      )}
      {isConnected && factoryReady && userEscrows.length === 0 && !escrowsLoading && (
        <Alert className="mb-3 rounded-2xl">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            {t('disputePage.noEscrows')}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Escrow, Reason & Severity */}
        <Card className="glass-panel rounded-2xl p-6 space-y-4">
          <Text variant="h4" className="font-bold mb-2">
            {t('disputePage.tradeAndReason')}
          </Text>

          {escrowsLoading ? (
            <div className="h-10 rounded-full bg-muted/60 animate-pulse" />
          ) : (
            <div>
              <Label className="text-base font-semibold mb-2 block">
                {t('disputePage.escrowContract')}
              </Label>
              <FullDropdown
                label={t('disputePage.escrowContract')}
                value={escrowAddress}
                onSelect={(v) => setEscrowAddress(v as `0x${string}`)}
                options={escrowOptions}
              />
              <p className="text-sm text-muted-foreground mt-1">
                {t('disputePage.escrowHint', {
                  address: `${KLEROS_ESCROW_FACTORY_ADDRESS.slice(0, 8)}…${KLEROS_ESCROW_FACTORY_ADDRESS.slice(-6)}`,
                })}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-base font-semibold mb-2 block">{t('disputePage.reason')}</Label>
              <FullDropdown
                label={t('disputePage.reason')}
                value={reason}
                onSelect={setReason}
                options={DISPUTE_REASONS.map((r) => ({ label: r.label, value: r.value }))}
              />
            </div>
            <div>
              <Label className="text-base font-semibold mb-2 block">
                {t('disputePage.severity')}
              </Label>
              <FullDropdown
                label={t('disputePage.severity')}
                value={severity}
                onSelect={(v) => setSeverity(v as SeverityLabel)}
                options={SEVERITY.map((s) => ({ label: s, value: s }))}
              />
            </div>
          </div>

          {/* Live arbitration fee from Kleros */}
          {effectiveEscrow && (
            <div className="rounded-xl border border-border bg-background/60 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <Text variant="small" className="text-muted-foreground">
                  {t('disputePage.klerosArbitrationFee')}
                </Text>
                {arbitrationCostWei == null ? (
                  <Text variant="muted" className="text-xs">
                    {t('disputePage.readingFee')}
                  </Text>
                ) : (
                  <Text variant="body" className="font-mono">
                    {arbitrationCostEth} ETH
                  </Text>
                )}
              </div>
              {arbitrationCostWei != null && (
                <a
                  href="https://court.kleros.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  {t('disputePage.klerosLink')} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          <Separator />

          <div>
            <Label
              htmlFor="description"
              className="text-base font-semibold mb-2 block"
            >
              {t('disputePage.whatHappened')}
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border border-border min-h-[120px] resize-none"
              placeholder={t('disputePage.descriptionPlaceholder')}
              maxLength={1000}
            />
            <p className="text-sm text-muted-foreground mt-1">
              {description.length}/1000
            </p>
          </div>
        </Card>

        {/* Proof */}
        <Card className="glass-panel rounded-2xl p-6">
          <Text variant="h4" className="font-bold mb-2">
            {t('disputePage.proof')}
          </Text>
          <p className="text-sm text-muted-foreground mb-2">
            {t('disputePage.proofHint', { maxSize: MAX_FILE_MB })}
          </p>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`cursor-pointer rounded-2xl border-2 border-dashed transition-colors px-6 py-6 flex flex-col items-center justify-center gap-2 text-center ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/40'
            }`}
          >
            <UploadCloud className="w-8 h-8 text-muted-foreground" />
            <Text variant="small" className="font-semibold">
              {t('disputePage.clickToUpload')}
            </Text>
            <Text variant="muted" className="text-xs">
              {t('disputePage.fileFormats', { maxSize: MAX_FILE_MB })}
            </Text>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />

          {files.length > 0 && (
            <ul className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              {files.map((f, idx) => (
                <li
                  key={`${f.name}-${idx}`}
                  className="relative group rounded-xl border border-border bg-background/60 overflow-hidden"
                >
                  <img
                    src={f.previewUrl}
                    alt={f.name}
                    className="w-full h-32 object-cover"
                  />
                  <div className="px-2 py-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate flex items-center gap-1 min-w-0">
                      <ImageIcon className="w-3 h-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {formatBytes(f.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-background/80 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    aria-label={t('disputePage.removeFile', { filename: f.name })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Acknowledgement */}
        <Card className="glass-panel rounded-2xl p-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 rounded accent-primary cursor-pointer"
            />
            <span className="text-sm text-muted-foreground">
              {t('disputePage.acknowledgement')}
            </span>
          </label>

          {!agreed && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              {t('disputePage.mustAcceptTerms')}
            </p>
          )}
        </Card>

        {/* Actions */}
        <div className="flex justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isSubmitting}
            className="rounded-full px-8 py-3 shadow-none"
          >
            {t('disputePage.reset')}
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit || !isConnected || !factoryReady}
            className="rounded-full px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {STAGE_LABEL[stage]}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                {t('disputePage.fileDispute')}
              </span>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}