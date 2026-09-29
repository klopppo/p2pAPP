import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { parseEventLogs, formatEther, type Abi } from 'viem'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { ChainGuard } from '@/components/custom/ChainGuard'
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
import { uploadToIpfs, cidToBytes32 } from '@/lib/ipfs'
import {
  KLEROS_ESC_ABI,
  KLEROS_ESC_EVENTS_ABI,
  KLEROS_ESCROW_FACTORY_ADDRESS,
  KlerosEscState,
  SEVERITY_TO_APPLEVEL,
  isFactoryConfigured,
  type SeverityLabel,
} from '@/lib/contracts'
import { explorerBase } from '@/lib/explorer'
import {
  createDispute,
  deleteDisputePlaceholder,
  generateDisputeId,
  ensureUser,
  getDisputesByTrade,
  getTradeByEscrowAddress,
  insertDisputeEvidence,
  updateDisputeOnChain,
  updateTradeStatus,
  type DisputeEvidenceFile,
} from '@/lib/supabase'
import { useUserEscrows, useArbitrationCost, useEscrowState } from '@/hooks/useDisputes'
import { useVerifiedEscrow } from '@/hooks/useVerifiedEscrow'
import { DisputeStatus, TradeEventType } from '@/types/database'
import { errorMessage } from '@/lib/errorMessage'
import { assertTxSuccess } from '@/lib/uiFormat'

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

// cidToBytes32 hashes "ipfs://" + cid to match the contract encoding.

export function DisputePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  // Stable short codes for `disputes.reason`; `reason_category` carries the
  // localized label.
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

  const queryEscrowParam = searchParams.get('escrowAddress')
  const queryEscrow =
    queryEscrowParam && /^0x[a-fA-F0-9]{40}$/.test(queryEscrowParam) ? (queryEscrowParam as `0x${string}`) : null

  const [escrowAddress, setEscrowAddress] = useState<`0x${string}` | ''>('')
  const [reason, setReason] = useState(DISPUTE_REASONS[0].value)
  const [severity, setSeverity] = useState<SeverityLabel>(SEVERITY[1])
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')

  // Mirror `files` into a ref so the unmount cleanup can revoke every preview
  // object URL without re-running on each change (that would kill live previews).
  const filesRef = useRef(files)
  useEffect(() => {
    filesRef.current = files
  }, [files])
  useEffect(
    () => () => {
      filesRef.current.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    },
    [],
  )

  const isSubmitting = stage !== 'idle'
  const factoryReady = isFactoryConfigured()

  const { data: userEscrows = [], isLoading: escrowsLoading } = useUserEscrows()
  // Fall back to the ?escrowAddress= param, then to the first user escrow.
  // The arbitration-cost hook + dropdown both consume `effectiveEscrow`.
  const effectiveEscrow = escrowAddress || queryEscrow || userEscrows[0] || ''
  const { data: arbitrationCostWei } = useArbitrationCost(
    effectiveEscrow || undefined,
  )

  // Trust gate: `effectiveEscrow` can come from the ?escrowAddress= param, so
  // the arbitration fee (msg.value) must not be sent until the factory confirms
  // it deployed this clone for the connected wallet.
  const {
    isVerified: escrowVerified,
    isVerifying: escrowVerifying,
  } = useVerifiedEscrow(effectiveEscrow || undefined)

  // Read escrow state to tag the filer role (buyer vs seller).
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
    if (!escrowVerified) {
      toast.error(
        t('disputePage.escrowUnverified', {
          defaultValue:
            'This escrow could not be verified against the configured factory for your wallet. The action is disabled to protect your funds.',
        }),
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
    // Need escrow state + role to enforce the window gate and raiser tag.
    if (!escrowState) {
      toast.error(t('disputePage.errorEscrowStateLoading'))
      return
    }
    if (filerRole == null) {
      toast.error(t('disputePage.errorNotAParty'))
      return
    }
    // Contract reverts DisputeWindowClosed after the grace window; block
    // before paying gas + arbitration.
    const graceElapsed =
      escrowState.confirmationTime > 0n &&
      BigInt(Math.floor(Date.now() / 1000)) >=
        escrowState.confirmationTime + escrowState.gracePeriod
    if (
      escrowState.state === KlerosEscState.CONFIRMED_PENDING &&
      graceElapsed
    ) {
      toast.error(t('disputePage.errorDisputeWindowClosed'))
      return
    }
    // raiseDispute() reverts InvalidState() outside FUNDED/CONFIRMED_PENDING.
    if (
      escrowState.state !== KlerosEscState.FUNDED &&
      escrowState.state !== KlerosEscState.CONFIRMED_PENDING
    ) {
      toast.error(t('disputePage.errorInvalidState'))
      return
    }
    // +10% buffer: the contract re-reads arbitrationCost and refunds excess,
    // so overpaying is safe but underpaying reverts WrongArbitrationFee.
    const arbitrationValueWei = arbitrationCostWei + arbitrationCostWei / 10n
    // Placeholder row is cleaned up in `finally` on any failure; a leftover
    // row would block every retry via the double-raise preflight.
    let placeholderId: string | null = null
    try {
      // Preflight balance: arbitrationFee + gas (~0.0001 ETH headroom).
      const balance = (await publicClient.getBalance({ address })) as bigint
      const required = arbitrationValueWei + 100000000000000n // arbitration + ~0.0001 ETH gas headroom
      if (balance < required) {
        toast.error(
          t('disputePage.errorInsufficientBalance', {
            required: Number(required) / 1e18,
            balance: Number(balance) / 1e18,
          }),
        )
        return
      }

      // Preflight user + trade + double-raise check BEFORE any storage upload:
      // the Storage RLS predicate joins on the leading dispute UUID, so the
      // row must exist first.
      const me = await ensureUser(address)
      if (!me) {
        toast.error(t('disputePage.errorConnectWallet'))
        return
      }
      const linkedTrade = await getTradeByEscrowAddress(effectiveEscrow)
      if (!linkedTrade) {
        toast.error(t('disputePage.errorNoTrade'))
        return
      }
      const existing = await getDisputesByTrade(linkedTrade.id)
      if (existing && existing.length > 0) {
        const prior = existing[0]
        toast.warning(t('disputePage.warningAlreadyRaised'))
        navigate(`/app/disputes/${prior.id}`)
        return
      }

      setStage('uploading')
      // 0) Row first: its UUID is the leading segment of every evidence path
      //    (Storage RLS joins on disputes.id). On-chain ids land after.
      const dispute = await createDispute({
        dispute_id: generateDisputeId(),
        trade_id: linkedTrade.id,
        buyer_id: linkedTrade.buyer_id,
        seller_id: linkedTrade.seller_id,
        reason,
        reason_category: DISPUTE_REASONS.find((r) => r.value === reason)?.label ?? reason,
        description,
        can_appeal: true,
        appeal_deadline: null,
        escrow_address: effectiveEscrow,
        kleros_dispute_id: null,
        tx_hash: null,
        tx_hash_evidence: null,
        evidence_cid: null,
        escrow_state: KlerosEscState.AWAITING_RULING,
        status: DisputeStatus.OPEN,
        evidence_group_id: 0,
        appeal_count: 0,
        raiser: filerRole ?? undefined,
        fee_paid_wei: arbitrationCostWei.toString(),
        dispute_timestamp: BigInt(Math.floor(Date.now() / 1000)).toString(),
      })
      placeholderId = dispute.id

      // 1) Upload proof pictures; the FIRST CID becomes the on-chain evidence
      //    reference. Bounded concurrency (3) and per-file failure isolation.
      const uploads: Array<{
        cid: string
        name: string
        size: number
        keccakBytes32: `0x${string}`
      }> = []
      const failedUploads: Array<{ name: string; error: string }> = []
      const concurrency = 3
      const queue = files.slice()
      const workers = Array.from(
        { length: Math.min(concurrency, queue.length) || 1 },
        async () => {
          while (queue.length) {
            const f = queue.shift()!
            try {
              const upload = await uploadToIpfs(f.file, dispute.id)
              uploads.push({
                cid: upload.cid,
                name: upload.name ?? f.file.name,
                size: upload.size ?? f.file.size,
                keccakBytes32: upload.keccakBytes32,
              })
            } catch (uploadErr) {
              console.warn(
                `[DisputePage] evidence upload failed for ${f.file.name}:`,
                uploadErr,
              )
              failedUploads.push({
                name: f.file.name,
                error:
                  uploadErr instanceof Error
                    ? uploadErr.message
                    : String(uploadErr),
              })
            }
          }
        },
      )
      await Promise.allSettled(workers)
      if (uploads.length === 0) {
        toast.error(t('disputePage.errorAllUploadsFailed'))
        return
      }
      if (failedUploads.length > 0) {
        toast.warning(
          t('disputePage.warningSomeUploadsFailed', {
            failed: failedUploads.length,
            total: files.length,
          }),
        )
      }
      const primaryCid = uploads[0].cid
      // On-chain bytes32 = keccak256("ipfs://" + cid).
      const evidenceBytes32 = cidToBytes32(primaryCid)

      // 2) Raise on-chain; raiseDispute() forwards the fee to Kleros.
      setStage('raising')
      const txHash = await writeContractAsync({
        address: effectiveEscrow,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'raiseDispute',
        value: arbitrationValueWei,
      })

      // 3) Wait (bounded) and decode the Kleros dispute ID from DisputeRaised.
      setStage('mining')
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 90_000,
      })

      // Reverted raise: tear down the RLS placeholder row, else the
      // double-raise preflight blocks every retry.
      if (receipt.status === 'reverted') {
        await deleteDisputePlaceholder(dispute.id).catch((cleanupErr) => {
          console.warn('[DisputePage] placeholder cleanup failed:', cleanupErr)
        })
        toast.error(t('disputePage.errorRaiseReverted'))
        return
      }
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
        console.warn('[DisputePage.tsx] decodeErr:', decodeErr)
      }

      // 4) Submit evidence bytes32 (ERC-1497); buyer/seller only (contract).
      setStage('submitting-evidence')
      let evidenceTxHash: `0x${string}` | null = null
      try {
        const evidenceHash = await writeContractAsync({
          address: effectiveEscrow,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: 'submitEvidence',
          args: [evidenceBytes32],
        })
        assertTxSuccess(
          await publicClient.waitForTransactionReceipt({
            hash: evidenceHash,
            timeout: 90_000,
          }),
        )
        evidenceTxHash = evidenceHash
      } catch (_evidenceErr) {
        // Dispute is raised; evidence is best-effort and retryable later.
        console.warn('[DisputePage] submitEvidence failed:', _evidenceErr)
        toast.warning(t('disputePage.warningEvidenceFailed'))
      }

      // 5) Persist on-chain metadata; IN_REVIEW so list filters surface it.
      //    The description blob stays back-compat with parseDescription.
      setStage('saving')
      await updateDisputeOnChain(dispute.id, {
        klerosDisputeId,
        txHash,
        txHashEvidence: evidenceTxHash,
        evidenceCid: primaryCid,
        status: DisputeStatus.IN_REVIEW,
        evidenceGroupId: 0,
        appealCount: 0,
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
      }).catch((err) => {
        console.warn('[DisputePage.tsx] updateDisputeOnChain:', err)
      })

      // 5a) One dispute_evidence row per file. keccakBytes32 is
      //     keccak256(fileBytes) (off-chain integrity check) — distinct from
      //     the on-chain URI hash stored in tx_hash_evidence.
      const evidenceFiles: DisputeEvidenceFile[] = uploads.map((u, idx) => ({
        cid: u.cid,
        name: u.name,
        size: u.size,
        keccakBytes32: u.keccakBytes32,
        // Only the primary file went through submitEvidence; extras null.
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

      // 5b) Mirror the trade as disputed (non-fatal; dispute row is truth).
      await updateTradeStatus(linkedTrade.id, 'disputed', {
        escrowStatus: 'disputed',
        txHash,
        escrowEventType: TradeEventType.ESCROW_DISPUTED,
      }).catch((err) => {
        console.warn('[DisputePage.tsx]', err)
      })

      toast.success(t('disputePage.successFiled'))
      // Success: clear the placeholder so `finally` doesn't delete the row.
      placeholderId = null
      navigate(`/app/disputes/${dispute.id}`)
    } catch (err) {
      toast.error(errorMessage(err, 'disputePage', t))
    } finally {
      // Any early return/throw left the placeholder: delete it (and its
      // uploaded files) so the double-raise preflight can't lock the user out.
      if (placeholderId) {
        const orphanId = placeholderId
        void deleteDisputePlaceholder(orphanId).catch((cleanupErr) => {
          console.warn('[DisputePage] placeholder cleanup failed:', cleanupErr)
        })
      }
      setStage('idle')
    }
  }

  const arbitrationCostEth = arbitrationCostWei
    ? formatEther(arbitrationCostWei)
    : null

  const canSubmit =
    agreed &&
    effectiveEscrow &&
    escrowVerified &&
    files.length > 0 &&
    arbitrationCostWei != null &&
    !isSubmitting

  return (
    <div className="w-full max-w-xl mx-auto">
      <ChainGuard />
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
      {isConnected && factoryReady && !!effectiveEscrow && !escrowVerified && (
        <Alert className="mb-3 rounded-2xl">
          <ShieldAlert className="w-4 h-4" />
          <AlertDescription>
            {escrowVerifying
              ? t('disputePage.escrowVerifying', {
                  defaultValue:
                    'Verifying the escrow contract against the configured factory…',
                })
              : t('disputePage.escrowUnverified', {
                  defaultValue:
                    'This escrow could not be verified against the configured factory for your connected wallet. Fund-moving actions are disabled to protect your funds.',
                })}
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
        {/* Trade, Reason & Severity */}
        <Card className="glass-panel rounded-2xl p-6 space-y-4">
          <Text variant="h4" className="font-bold mb-2">
            {t('disputePage.tradeAndReason')}
          </Text>

          {/* Read-only escrow (from the trade-detail link); resolved via
              userEscrows so the deposit-time / lock-time gates work. */}
          {escrowsLoading ? (
            <div className="h-10 rounded-full bg-muted/60 animate-pulse" />
          ) : effectiveEscrow ? (
            <div>
              <Label className="text-base font-semibold mb-2 block">
                {t('disputePage.escrowContract')}
              </Label>
              <div className="flex items-center gap-2 px-4 h-10 rounded-full border border-border bg-muted/40 text-sm">
                <code className="font-mono text-xs">
                  {effectiveEscrow.slice(0, 10)}…{effectiveEscrow.slice(-8)}
                </code>
                <a
                  href={`${explorerBase.address}${effectiveEscrow}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  Blockscan <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {t('disputePage.escrowHint', {
                  address: `${KLEROS_ESCROW_FACTORY_ADDRESS.slice(0, 8)}…${KLEROS_ESCROW_FACTORY_ADDRESS.slice(-6)}`,
                })}
              </p>
            </div>
          ) : null}

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
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isSubmitting}
            className="rounded-full px-8 py-3 shadow-none w-full sm:w-auto justify-center"
          >
            {t('disputePage.reset')}
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit || !isConnected || !factoryReady}
            className="rounded-full px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto justify-center"
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