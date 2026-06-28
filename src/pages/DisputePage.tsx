import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { FullDropdown } from '@/components/custom/FullDropdown'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { UploadCloud, X, FileVideo, FileText, ShieldAlert, AlertTriangle } from 'lucide-react'
import { uploadToIpfs } from '@/lib/ipfs'

interface OpenOrder {
  id: string
  label: string
}

interface UploadedFile {
  file: File
  name: string
  size: number
  type: string
}

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

const SEVERITY = ['Low', 'Medium', 'High', 'Critical']

const MAX_FILE_MB = 50

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DisputePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [orderId, setOrderId] = useState(OPEN_ORDERS[0].id)
  const [reason, setReason] = useState(DISPUTE_REASONS[0])
  const [severity, setSeverity] = useState(SEVERITY[1])
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const accepted: UploadedFile[] = []
    Array.from(incoming).forEach((f) => {
      if (f.size > MAX_FILE_MB * 1024 * 1024) return // skip oversized
      accepted.push({ file: f, name: f.name, size: f.size, type: f.type })
    })
    // de-dupe by name+size
    setFiles((prev) => {
      const merged = [...prev]
      accepted.forEach((a) => {
        if (!merged.some((m) => m.name === a.name && m.size === a.size)) merged.push(a)
      })
      return merged
    })
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx))

  const handleReset = () => {
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
    if (!agreed) return
    setIsSubmitting(true)
    try {
      // Upload each evidence file to IPFS — collect CIDs + gateway links.
      const uploads = await Promise.all(
        files.map((f) => uploadToIpfs(f.file)),
      )
      console.log('Dispute filed:', {
        orderId,
        reason,
        severity,
        description,
        evidence: uploads, // [{ cid, url, size, name }]
      })
      navigate(-1)
    } catch (err) {
      console.error('IPFS upload failed:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = agreed && orderId && reason

  return (
    <div className="w-full max-w-xl mx-auto">
      <AppPageHeader
        title="Open a Dispute"
        subtitle="Report an issue with a trade — an arbitrator will review your case"
        variant="centered"
        onBack={() => navigate(-1)}
      />

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
                  onSelect={setSeverity}
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

        {/* Evidence */}
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <Text variant="h4" className="font-bold mb-2">Evidence</Text>
          <p className="text-sm text-muted-foreground mb-2">
            Upload screenshots, chat logs, or videos. Max {MAX_FILE_MB}MB each.
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
            <Text variant="muted" className="text-xs">PNG, JPG, PDF, MP4, MOV up to {MAX_FILE_MB}MB</Text>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,video/*"
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />

          {files.length > 0 && (
            <ul className="mt-4 space-y-2">
              {files.map((f, idx) => (
                <li
                  key={`${f.name}-${idx}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2"
                >
                  {f.type.startsWith('video') ? (
                    <FileVideo className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate text-sm">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="w-4 h-4" />
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
            className="rounded-full px-8 py-3 shadow-none"
          >
            Reset
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="rounded-full px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Filing…' : (
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
