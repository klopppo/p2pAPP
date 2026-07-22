import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { parseEventLogs } from 'viem'
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
} from 'lucide-react'
import { uploadToIpfs } from '@/lib/ipfs'
import {
  DISPUTE_CONTRACT_ADDRESS,
  DISPUTE_CONTRACT_ABI,
  SEVERITY_TO_UINT8,
  isDisputeContractConfigured,
  tradeIdToBytes32,
  type SeverityLabel,
} from '@/lib/contracts'
import { createDispute, getUserByWallet, upsertUser, generateDisputeId } from '@/lib/supabase'

interface OpenOrder {
  id: string
  label: string
}

interface UploadedFile {
  file: File
  name: string
  size: number
  type: string
  previewUrl: string
}

/** Mock order list — replace with `useTrades()` once the trades query hook lands. */
const OPEN_ORDERS: OpenOrder[] = [
  { id: 'ord_1', label: 'Buy 0.5 ETH from CryptoKing — #ord_1' },
  { id: 'ord_2', label: 'Sell 1.2 BTC to trade84 — #ord_2' },
  { id: 'ord_3', label: 'Buy 500 USDC from Brianx786 — #ord_3' },
]

const DISPUTE_REASONS = [
  'No payment received',
  'Payment released without confirmation',
  'Counterparty unresponsive',
  'Wrong amount sent',
  'Suspected fraud / scam',
  'Other',
]

const SEVERITY: SeverityLabel[] = ['Low', 'Medium', 'High', 'Critical']

const MAX_FILE_MB = 10
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/heic'

type Stage = 'idle' | 'uploading' | 'signing' | 'mining' | 'saving'

const STAGE_LABEL: Record<Stage, string> = {
  idle: 'File Dispute',
  uploading: 'Uploading proof…',
  signing: 'Confirm in wallet…',
  mining: 'Waiting for confirmation…',
  saving: 'Saving dispute…',
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DisputePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [orderId, setOrderId] = useState(OPEN_ORDERS[0].id)
  const [reason, setReason] = useState(DISPUTE_REASONS[0])
  const [severity, setSeverity] = useState<SeverityLabel>(SEVERITY[1])
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')

  const isSubmitting = stage !== 'idle'
  const contractReady = isDisputeContractConfigured()

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const accepted: UploadedFile[] = []
    Array.from(incoming).forEach((f) => {
      if (!f.type.startsWith('image/')) return // drop anything that isn't a picture
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
    setOrderId(OPEN_ORDERS[0].id)
    setReason(DISPUTE_REASONS[0])
    setSeverity(SEVERITY[1])
    setDescription('')
    setFiles([])
    setAgreed(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed || isSubmitting) return

    // Pre-flight: wallet + contract readiness checks. Fail fast with a toast
    // so the user lands back on the form instead of a silent half-submit.
    if (!isConnected || !address) {
      toast.error('Connect your wallet to file a dispute.')
      return
    }
    if (!contractReady) {
      toast.error(
        'Dispute contract not configured. Set VITE_DISPUTE_CONTRACT_ADDRESS in .env.',
      )
      return
    }
    if (files.length === 0) {
      toast.error('Upload at least one proof picture.')
      return
    }
    if (!publicClient) {
      toast.error('Public RPC client not ready. Try again.')
      return
    }

    setStage('uploading')
    try {
      // 1) Upload proof pictures to IPFS. The first CID becomes the on-chain
      //    evidence reference; full upload list is persisted to the DB so the
      //    detail viewer can show every attachment.
      const uploads = await Promise.all(files.map((f) => uploadToIpfs(f.file)))
      const primaryCid = uploads[0].cid

      // 2) Resolve the filer's Supabase user id (create-if-missing) so the DB
      //    row satisfies the foreign key on disputes.buyer_id.
      await upsertUser(address)
      const user = await getUserByWallet(address)
      if (!user) throw new Error('Could not resolve Supabase user for this wallet.')

      // 3) Send the on-chain createDispute tx. `writeContractAsync` resolves
      //    once the user signs and the tx is broadcast (NOT confirmed).
      setStage('signing')
      const tradeKeyBytes32 = tradeIdToBytes32(orderId)
      const txHash = await writeContractAsync({
        // The `contractReady` guard above proves this matches the regex, so
        // the cast is safe — TS just can't narrow the type through it.
        address: DISPUTE_CONTRACT_ADDRESS as `0x${string}`,
        abi: DISPUTE_CONTRACT_ABI,
        functionName: 'createDispute',
        args: [tradeKeyBytes32, primaryCid, SEVERITY_TO_UINT8[severity]],
      })

      // 4) Wait for inclusion + decode the DisputeCreated event so we know the
      //    on-chain `disputeId` assigned by the contract.
      setStage('mining')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      let onChainDisputeId: string | null = null
      try {
        const logs = parseEventLogs({
          abi: DISPUTE_CONTRACT_ABI,
          eventName: 'DisputeCreated',
          logs: receipt.logs,
        })
        const args = logs[0]?.args as { disputeId?: bigint } | undefined
        if (args?.disputeId !== undefined) onChainDisputeId = args.disputeId.toString()
      } catch (decodeErr) {
        // Receipt confirmed but event decode failed — proceed and store
        // `on_chain_dispute_id` as null. Detail viewer will surface this.
        console.warn('[DisputePage] DisputeCreated event not found in receipt:', decodeErr)
      }

      // 5) Persist the dispute to Supabase with on-chain metadata baked in.
      //    NOTE: this assumes the trades row already exists (referenced by id);
      //    for the mocked order list the FK is satisfied by the test row.
      setStage('saving')
      const evidenceJson = JSON.stringify(
        uploads.map((u) => ({
          cid: u.cid,
          url: u.url,
          name: u.name,
          size: u.size,
        })),
      )
      const dispute = await createDispute({
        dispute_id: generateDisputeId(),
        // TODO: map orderId → actual trade UUID once useTrades() lands.
        trade_id: orderId,
        buyer_id: user.id,
        seller_id: user.id, // placeholder — real flow resolves counterparty from trade
        reason,
        reason_category: reason,
        description: [
          description,
          `--- on-chain ---`,
          `tx_hash: ${txHash}`,
          `dispute_id: ${onChainDisputeId ?? '(event not decoded)'}`,
          `evidence_cid: ${primaryCid}`,
          `evidence: ${evidenceJson}`,
        ].join('\n\n'),
        can_appeal: false,
        appeal_deadline: null,
      })

      toast.success('Dispute filed on-chain.')
      navigate(`/app/disputes/${dispute.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Failed to file dispute: ' + msg)
      console.error('[DisputePage] submit failed:', err)
    } finally {
      setStage('idle')
    }
  }

  const canSubmit = agreed && orderId && reason && files.length > 0 && !isSubmitting

  return (
    <div className="w-full max-w-xl mx-auto">
      <AppPageHeader
        title="Open a Dispute"
        subtitle="Report an issue with a trade — an arbitrator will review your case"
        variant="centered"
        onBack={() => navigate(-1)}
      />

      {/* Wallet + contract readiness hints. Non-blocking; the actual block is
          inside the submit handler so the form still renders for inspection. */}
      {!isConnected && (
        <Alert className="mb-3 rounded-2xl">
          <Wallet className="w-4 h-4" />
          <AlertDescription>
            Connect your wallet to file a dispute. The on-chain transaction is
            signed from your connected account.
          </AlertDescription>
        </Alert>
      )}
      {isConnected && !contractReady && (
        <Alert className="mb-3 rounded-2xl border-destructive/40 text-destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            Dispute contract address is not configured
            (VITE_DISPUTE_CONTRACT_ADDRESS). Filing is disabled until the env
            var is set.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Trade, Reason & Description */}
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <Text variant="h4" className="font-bold mb-2">Trade & Reason</Text>

          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold mb-2 block">Open Order</Label>
              <FullDropdown
                label="Order"
                value={orderId}
                onSelect={setOrderId}
                options={OPEN_ORDERS.map((o) => ({ label: o.label, value: o.id }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-base font-semibold mb-2 block">Reason</Label>
                <FullDropdown
                  label="Reason"
                  value={reason}
                  onSelect={setReason}
                  options={DISPUTE_REASONS.map((r) => ({ label: r, value: r }))}
                />
              </div>
              <div>
                <Label className="text-base font-semibold mb-2 block">Severity</Label>
                <FullDropdown
                  label="Severity"
                  value={severity}
                  onSelect={(v) => setSeverity(v as SeverityLabel)}
                  options={SEVERITY.map((s) => ({ label: s, value: s }))}
                />
              </div>
            </div>

            <Separator />

            <div>
              <Label htmlFor="description" className="text-base font-semibold mb-2 block">
                What happened?
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="border border-border min-h-[120px] resize-none"
                placeholder="Describe the issue in detail. Include dates, amounts, and any communication that supports your case."
                maxLength={1000}
              />
              <p className="text-sm text-muted-foreground mt-1">{description.length}/1000</p>
            </div>
          </div>
        </Card>

        {/* Evidence (picture only) */}
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <Text variant="h4" className="font-bold mb-2">Proof</Text>
          <p className="text-sm text-muted-foreground mb-2">
            Upload screenshots, chat captures, or photos as proof. Pictures
            only (PNG/JPG/WebP/GIF/HEIC), up to {MAX_FILE_MB}MB each. The first
            picture is pinned to the on-chain dispute; extras attach to the
            record.
          </p>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`cursor-pointer rounded-2xl border-2 border-dashed transition-colors px-6 py-6 flex flex-col items-center justify-center gap-2 text-center ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/40'
            }`}
          >
            <UploadCloud className="w-8 h-8 text-muted-foreground" />
            <Text variant="small" className="font-semibold">Click to upload or drag & drop</Text>
            <Text variant="muted" className="text-xs">
              PNG, JPG, WebP, GIF, HEIC — up to {MAX_FILE_MB}MB each
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
                    <span className="text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-background/80 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Acknowledgement */}
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 rounded accent-primary cursor-pointer"
            />
            <span className="text-sm text-muted-foreground">
              I have read and agree to the{' '}
              <a href="#" className="text-primary hover:underline">Terms of Service</a>,{' '}
              <a href="#" className="text-primary hover:underline">Dispute Policy</a>, and confirm the
              information provided is accurate. Filing a false dispute may result in account penalties.
              A transaction will be sent from my connected wallet.
            </span>
          </label>

          {!agreed && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              You must accept the terms to continue.
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
            Reset
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit || !isConnected || !contractReady}
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
                File Dispute
              </span>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
