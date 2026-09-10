import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldAlert, X, AlertTriangle, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FullDropdown } from '@/components/custom/FullDropdown'
import { createUserReport } from '@/lib/reportsService'
import { ReportCategory } from '@/types/rbac'
import { useAccount } from 'wagmi'

interface ReportUserModalProps {
  isOpen: boolean
  onClose: () => void
  reportedWallet: string
  tradeId?: string | null
  conversationId?: string | null
  messageId?: string | null
}

const CATEGORY_OPTIONS = [
  { label: 'Tentativo di Truffa (Scam)', value: ReportCategory.SCAM_ATTEMPT },
  { label: 'Frode nel Pagamento (Ricevuta Falsa)', value: ReportCategory.PAYMENT_FRAUD },
  { label: 'Messaggi Ingiuriosi / Minacce', value: ReportCategory.ABUSIVE_MESSAGES },
  { label: 'Scambio Fuori Piattaforma', value: ReportCategory.OFF_PLATFORM_TRADING },
  { label: 'Furto Identità (Impersonation)', value: ReportCategory.IMPERSONATION },
  { label: 'Violazione Termini di Servizio', value: ReportCategory.TERMS_VIOLATION },
  { label: 'Altro Motivo', value: ReportCategory.OTHER },
]

export function ReportUserModal({
  isOpen,
  onClose,
  reportedWallet,
  tradeId,
  conversationId,
  messageId,
}: ReportUserModalProps) {
  const { address } = useAccount()
  const [category, setCategory] = useState<ReportCategory>(ReportCategory.SCAM_ATTEMPT)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) {
      toast.error('Inserisci una descrizione dettagliata del problema riscontrato.')
      return
    }

    const myWallet = address || '0xAnon...Trader'

    try {
      setSubmitting(true)
      await createUserReport({
        reporter_wallet: myWallet,
        reported_wallet: reportedWallet,
        category,
        reason: reason.trim(),
        trade_id: tradeId,
        conversation_id: conversationId,
        message_id: messageId,
      })

      toast.success('Segnalazione inviata con successo agli operatori!')
      setReason('')
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore durante l’invio della segnalazione'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-lg"
        >
          <Card className="bg-background/90 backdrop-blur-xl shadow-2xl border border-border/60 p-6 rounded-2xl relative">
            <button
              onClick={onClose}
              disabled={submitting}
              className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <Text variant="h4" className="font-bold">Invia Segnalazione Operatori</Text>
                  <p className="text-xs text-muted-foreground">
                    I dettagli e i messaggi correlati saranno inviati al team di supporto e compliance.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border/50 text-xs space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Utente Segnalato:</span>
                  <span className="text-foreground font-semibold">{reportedWallet}</span>
                </div>
                {tradeId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ID Transazione / Trade:</span>
                    <span className="text-foreground">{tradeId}</span>
                  </div>
                )}
                {conversationId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ID Chat:</span>
                    <span className="text-foreground">{conversationId}</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Motivo Segnalazione</Label>
                  <FullDropdown
                    label="Categoria"
                    value={category}
                    options={CATEGORY_OPTIONS}
                    onSelect={(val) => setCategory(val as ReportCategory)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Descrizione Dettagliata</Label>
                  <Textarea
                    placeholder="Descrivi cosa è accaduto (es. ricevuta bancaria contraffatta, minacce in chat, richiesta di pagamento esterno...)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    className="border border-border resize-none rounded-xl"
                  />
                  <p className="text-xs text-muted-foreground">
                    Fornisci quante più informazioni possibili per facilitare la verifica degli operatori.
                  </p>
                </div>

                <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Le false segnalazioni o l’abuso del sistema possono comportare sanzioni sul punteggio reputazione.</span>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onClose}
                    disabled={submitting}
                    className="rounded-full"
                  >
                    Annulla
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={submitting || !reason.trim()}
                    className="rounded-full gap-2 shadow-none"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Invio in corso...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" /> Invia agli Operatori
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
