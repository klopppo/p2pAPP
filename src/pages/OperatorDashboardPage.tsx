import { useState, useEffect, useMemo } from 'react'
import {
  ShieldAlert,
  Activity,
  MessageSquare,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Search,
  RefreshCw,
  Lock,
  FileText,
  AlertTriangle,
  UserCheck,
  Building2,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FullDropdown } from '@/components/custom/FullDropdown'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listUserActivityLogs, type ListLogsFilters } from '@/lib/auditLogger'
import {
  DEFAULT_PROGRAMS,
  DEFAULT_ROLES,
  DEFAULT_PERMISSIONS,
  getCurrentOperator,
  setCurrentOperator,
  listOperators,
  hasPermission,
  isPermissionEnabled,
  toggleRolePermission,
  listInspectableConversations,
  getConversationTranscript,
  type InspectableConversation,
  type InspectableMessage,
} from '@/lib/operatorService'
import {
  listUserReports,
  resolveUserReport,
  type ListReportsFilters,
} from '@/lib/reportsService'
import type {
  UserActivityLog,
  UserReport,
  SysOperator,
  ReportStatus,
} from '@/types/rbac'

export function OperatorDashboardPage() {
  const [activeTab, setActiveTab] = useState<
    'reports' | 'logs' | 'messages' | 'rbac'
  >('reports')
  const [operators, setOperators] = useState<SysOperator[]>([])
  const [currentOp, setCurOp] = useState<SysOperator>(getCurrentOperator())

  // Reports state
  const [reports, setReports] = useState<UserReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportFilterStatus, setReportFilterStatus] = useState('all')
  const [selectedReport, setSelectedReport] = useState<UserReport | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [resolving, setResolving] = useState(false)

  // Logs state
  const [logs, setLogs] = useState<UserActivityLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logFilterAction, setLogFilterAction] = useState('')
  const [logFilterProgram, setLogFilterProgram] = useState('all')
  const [logFilterWallet, setLogFilterWallet] = useState('')
  const [selectedLog, setSelectedLog] = useState<UserActivityLog | null>(null)

  // Messages inspector state
  const [conversations, setConversations] = useState<InspectableConversation[]>(
    []
  )
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<InspectableMessage[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)

  // RBAC matrix role selector
  const [matrixRole, setMatrixRole] = useState('COMPLIANCE_LEAD')
  const [, setRbacUpdateTick] = useState(0)

  // Load initial data
  const loadInitial = async () => {
    const ops = await listOperators()
    setOperators(ops)
    setCurOp(getCurrentOperator())
    fetchReports()
    fetchLogs()
  }

  useEffect(() => {
    loadInitial()
  }, [])

  // Fetch Reports
  const fetchReports = async () => {
    setReportsLoading(true)
    try {
      const filters: ListReportsFilters = {
        status: reportFilterStatus,
      }
      const data = await listUserReports(filters)
      setReports(data)
    } finally {
      setReportsLoading(false)
    }
  }

  // Fetch Logs
  const fetchLogs = async () => {
    setLogsLoading(true)
    try {
      const filters: ListLogsFilters = {
        action: logFilterAction || undefined,
        program_id: logFilterProgram,
        wallet: logFilterWallet || undefined,
        limit: 100,
      }
      const data = await listUserActivityLogs(filters)
      setLogs(data)
    } finally {
      setLogsLoading(false)
    }
  }

  // Fetch Conversations for inspection
  const fetchConversations = async () => {
    setMessagesLoading(true)
    try {
      const data = await listInspectableConversations(currentOp.id)
      setConversations(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Accesso negato'
      toast.error(msg)
    } finally {
      setMessagesLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'reports') fetchReports()
    if (activeTab === 'logs') fetchLogs()
    if (activeTab === 'messages') fetchConversations()
  }, [activeTab, reportFilterStatus, logFilterProgram])

  // Handle Operator Switcher
  const handleOperatorSwitch = (opId: string) => {
    const nextOp = setCurrentOperator(opId)
    setCurOp(nextOp)
    toast.success(
      `Sessione operatore attiva: ${nextOp.full_name || nextOp.username} (${(nextOp.roles ?? []).join(', ') || 'OPERATOR'})`
    )
    if (activeTab === 'messages') {
      fetchConversations()
      setActiveConvId(null)
      setTranscript([])
    }
  }


  // Resolve Report
  const handleResolveReport = async (status: ReportStatus) => {
    if (!selectedReport) return
    setResolving(true)
    try {
      await resolveUserReport(
        selectedReport.id,
        currentOp.id,
        status,
        resolutionNotes
      )
      toast.success(
        status === 'RESOLVED'
          ? 'Segnalazione risolta con successo!'
          : 'Segnalazione archiviata/respinta'
      )
      setSelectedReport(null)
      setResolutionNotes('')
      fetchReports()
      fetchLogs() // aggiorna audit logs
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Errore durante la risoluzione della segnalazione'
      toast.error(msg)
    } finally {
      setResolving(false)
    }
  }

  // Load Transcript with Audit Log
  const handleOpenTranscript = async (convId: string) => {
    setActiveConvId(convId)
    setTranscriptLoading(true)
    try {
      const messages = await getConversationTranscript(currentOp.id, convId)
      setTranscript(messages)
      toast.info('Accesso alla conversazione registrato nell’Audit Log.')
      fetchLogs()
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Accesso negato alla visualizzazione dei messaggi'
      toast.error(msg)
      setActiveConvId(null)
    } finally {
      setTranscriptLoading(false)
    }
  }

  // Handle RBAC Switch Toggle
  const handlePermissionToggle = (
    progId: string,
    permId: string,
    enabled: boolean
  ) => {
    toggleRolePermission(progId, matrixRole, permId, enabled)
    setRbacUpdateTick((t) => t + 1)
    toast.success(
      `Permesso ${permId} per ${matrixRole} su ${progId}: ${enabled ? 'Abilitato' : 'Revocato'}`
    )
    fetchLogs()
  }

  // Stats calculation
  const pendingReportsCount = useMemo(
    () => reports.filter((r) => r.status === 'PENDING').length,
    [reports]
  )
  const inReviewReportsCount = useMemo(
    () => reports.filter((r) => r.status === 'IN_REVIEW').length,
    [reports]
  )

  const canViewMessages = hasPermission(
    currentOp.roles,
    'MESSAGES_INSPECTOR',
    'VIEW'
  )
  const canReadPrivateMessages = hasPermission(
    currentOp.roles,
    'MESSAGES_INSPECTOR',
    'VIEW_PRIVATE_MESSAGES'
  )
  const canAuditRead = hasPermission(
    currentOp.roles,
    'AUDIT_LOGGER',
    'AUDIT_READ'
  )
  const canResolveReports = hasPermission(
    currentOp.roles,
    'USER_REPORTS',
    'RESOLVE_REPORT'
  )

  return (
    <section className="space-y-8">
      {/* Top Header */}
      <AppPageHeader
        title="Operator & Compliance Portal"
        subtitle="Audit logger dei movimenti, gestione segnalazioni, ispezione messaggi e matrice RBAC"
        variant="split"
        action={
          <div className="flex items-center gap-2">
            <FullDropdown
              label="Operatore Attivo"
              value={currentOp.id}
              options={operators.map((op) => ({
                label: `${op.username} (${(op.roles ?? [])[0] ?? 'OPERATOR'})`,
                value: op.id,
              }))}
              onSelect={handleOperatorSwitch}
            />
          </div>
        }
      />

      {/* Operator Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Text variant="body" className="font-bold text-foreground">
                {currentOp.full_name || currentOp.username}
              </Text>
              <Badge variant="default" className="rounded-full text-xs">
                {(currentOp.roles ?? []).join(', ') || 'OPERATOR'}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full text-xs text-muted-foreground font-mono"
              >
                {currentOp.wallet_address || 'Internal Staff'}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              Ultimo accesso registrato: {new Date().toLocaleTimeString()} • IP:
              127.0.0.1
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canAuditRead && (
            <Badge
              variant="outline"
              className="rounded-full border-primary/40 text-primary text-xs"
            >
              ✓ Audit Reader
            </Badge>
          )}
          {canReadPrivateMessages && (
            <Badge
              variant="outline"
              className="rounded-full border-primary/40 text-primary text-xs"
            >
              ✓ Chat Inspector
            </Badge>
          )}
          {canResolveReports && (
            <Badge
              variant="outline"
              className="rounded-full border-primary/40 text-primary text-xs"
            >
              ✓ Report Resolver
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Bento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <CardContent className="space-y-1">
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Segnalazioni Aperte
              </span>
              <ShieldAlert className="w-4 h-4 text-destructive" />
            </div>
            <div className="text-3xl font-extrabold text-foreground">
              {pendingReportsCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {inReviewReportsCount} in fase di revisione
            </p>
          </CardContent>
        </Card>

        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <CardContent className="space-y-1">
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Movimenti Registrati
              </span>
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <div className="text-3xl font-extrabold text-foreground">
              {logs.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Audit log telemetria real-time
            </p>
          </CardContent>
        </Card>

        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <CardContent className="space-y-1">
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Operatori nel Sistema
              </span>
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-extrabold text-foreground">
              {operators.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Ruoli RBAC attivi e sincronizzati
            </p>
          </CardContent>
        </Card>

        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          <CardContent className="space-y-1">
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Programmi di Controllo
              </span>
              <Building2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-extrabold text-foreground">
              {DEFAULT_PROGRAMS.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Moduli operativi protetti
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-border/50 pb-3 overflow-x-auto">
        <Button
          variant={activeTab === 'reports' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('reports')}
          className="rounded-full gap-2 text-sm cursor-pointer"
        >
          <ShieldAlert className="w-4 h-4" />
          Segnalazioni Utenti ({reports.length})
        </Button>
        <Button
          variant={activeTab === 'logs' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('logs')}
          className="rounded-full gap-2 text-sm cursor-pointer"
        >
          <Activity className="w-4 h-4" />
          Audit Logger Movimenti ({logs.length})
        </Button>
        <Button
          variant={activeTab === 'messages' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('messages')}
          className="rounded-full gap-2 text-sm cursor-pointer"
        >
          <MessageSquare className="w-4 h-4" />
          Ispezione Messaggi Utenti
        </Button>
        <Button
          variant={activeTab === 'rbac' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('rbac')}
          className="rounded-full gap-2 text-sm cursor-pointer"
        >
          <Lock className="w-4 h-4" />
          Programmi, Ruoli e Permessi
        </Button>
      </div>

      {/* TAB 1: SEGNALAZIONI UTENTI */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <FullDropdown
                label="Stato"
                value={reportFilterStatus}
                options={[
                  { label: 'Tutti gli Stati', value: 'all' },
                  { label: 'In Attesa (Pending)', value: 'PENDING' },
                  { label: 'In Revisione (In Review)', value: 'IN_REVIEW' },
                  { label: 'Risolte (Resolved)', value: 'RESOLVED' },
                  { label: 'Respinte (Dismissed)', value: 'DISMISSED' },
                ]}
                onSelect={(val) => setReportFilterStatus(val)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchReports}
              disabled={reportsLoading}
              className="rounded-full gap-1.5"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${reportsLoading ? 'animate-spin' : ''}`}
              />
              Ricarica
            </Button>
          </div>

          <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/50">
                      <TableHead className="font-semibold">ID</TableHead>
                      <TableHead className="font-semibold">Categoria</TableHead>
                      <TableHead className="font-semibold">Segnalante</TableHead>
                      <TableHead className="font-semibold">
                        Utente Segnalato
                      </TableHead>
                      <TableHead className="font-semibold">Motivo</TableHead>
                      <TableHead className="font-semibold">Stato</TableHead>
                      <TableHead className="font-semibold">Data</TableHead>
                      <TableHead className="text-right font-semibold">
                        Azione
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center py-8 text-muted-foreground"
                        >
                          Nessuna segnalazione trovata con i filtri correnti.
                        </TableCell>
                      </TableRow>
                    ) : (
                      reports.map((r) => (
                        <TableRow
                          key={r.id}
                          className="hover:bg-muted/40 transition-colors border-b border-border/40"
                        >
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {r.id}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="rounded-full text-xs"
                            >
                              {r.category.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.reporter_wallet}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-destructive">
                            {r.reported_wallet}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-xs">
                            {r.reason}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                r.status === 'RESOLVED'
                                  ? 'default'
                                  : r.status === 'PENDING'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                              className="rounded-full text-xs"
                            >
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(r.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedReport(r)
                                setResolutionNotes(r.resolution_notes || '')
                              }}
                              className="rounded-full h-8 text-xs gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" /> Gestisci
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Modal Gestione Segnalazione */}
          {selectedReport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
              <Card className="w-full max-w-xl bg-background/95 backdrop-blur-2xl shadow-2xl border border-border/60 p-6 rounded-2xl space-y-4">
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <Text variant="h4" className="font-bold">
                        Gestione Segnalazione #{selectedReport.id}
                      </Text>
                      <p className="text-xs text-muted-foreground">
                        Revisione e provvedimento operatore
                      </p>
                    </div>
                    <Badge
                      variant={
                        selectedReport.status === 'RESOLVED'
                          ? 'default'
                          : 'destructive'
                      }
                      className="rounded-full"
                    >
                      {selectedReport.status}
                    </Badge>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border/50 text-xs space-y-2 font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Categoria:</span>
                      <span className="text-foreground font-semibold">
                        {selectedReport.category}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Segnalante:</span>
                      <span>{selectedReport.reporter_wallet}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Utente Accusato:
                      </span>
                      <span className="text-destructive font-bold">
                        {selectedReport.reported_wallet}
                      </span>
                    </div>
                    {selectedReport.trade_id && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Trade Collegato:
                        </span>
                        <span>{selectedReport.trade_id}</span>
                      </div>
                    )}
                    {selectedReport.conversation_id && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Chat Collegata:
                        </span>
                        <span>{selectedReport.conversation_id}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Descrizione del Segnalante:
                    </span>
                    <div className="p-3 rounded-xl bg-card border border-border/50 text-sm">
                      {selectedReport.reason}
                    </div>
                  </div>

                  {canResolveReports && (
                    <div className="space-y-2 pt-2">
                      <span className="text-xs font-semibold">
                        Note e Provvedimento Operatore:
                      </span>
                      <Textarea
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                        placeholder="Inserisci la motivazione della decisione (es. account sospeso, ammonimento inviato, contestazione infondata...)"
                        rows={3}
                        className="rounded-xl border-border resize-none"
                      />
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-3 border-t border-border/50">
                    <Button
                      variant="ghost"
                      onClick={() => setSelectedReport(null)}
                      className="rounded-full"
                    >
                      Chiudi
                    </Button>

                    {canResolveReports && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          disabled={resolving}
                          onClick={() => handleResolveReport('DISMISSED')}
                          className="rounded-full gap-1 text-xs"
                        >
                          <XCircle className="w-4 h-4 text-muted-foreground" />{' '}
                          Respingi
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={resolving}
                          onClick={() => handleResolveReport('IN_REVIEW')}
                          className="rounded-full gap-1 text-xs"
                        >
                          <Clock className="w-4 h-4" /> In Revisione
                        </Button>
                        <Button
                          variant="default"
                          disabled={resolving}
                          onClick={() => handleResolveReport('RESOLVED')}
                          className="rounded-full gap-1 text-xs"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Risolvi & Chiudi
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AUDIT LOGGER MOVIMENTI */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cerca per wallet..."
                  value={logFilterWallet}
                  onChange={(e) => setLogFilterWallet(e.target.value)}
                  className="pl-9 rounded-full max-w-xs h-9 text-xs"
                />
              </div>

              <div className="relative">
                <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filtra per azione (es. ESCROW)..."
                  value={logFilterAction}
                  onChange={(e) => setLogFilterAction(e.target.value)}
                  className="pl-9 rounded-full max-w-xs h-9 text-xs"
                />
              </div>

              <FullDropdown
                label="Programma"
                value={logFilterProgram}
                options={[
                  { label: 'Tutti i Programmi', value: 'all' },
                  ...DEFAULT_PROGRAMS.map((p) => ({
                    label: p.name,
                    value: p.id,
                  })),
                ]}
                onSelect={(val) => setLogFilterProgram(val)}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={logsLoading}
              className="rounded-full gap-1.5"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`}
              />
              Ricarica Log
            </Button>
          </div>

          <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/50">
                      <TableHead className="font-semibold">ID</TableHead>
                      <TableHead className="font-semibold">Timestamp</TableHead>
                      <TableHead className="font-semibold">Programma</TableHead>
                      <TableHead className="font-semibold">Azione</TableHead>
                      <TableHead className="font-semibold">
                        Soggetto (Wallet / Operatore)
                      </TableHead>
                      <TableHead className="font-semibold">Risorsa</TableHead>
                      <TableHead className="font-semibold">Stato</TableHead>
                      <TableHead className="text-right font-semibold">
                        Snapshot
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center py-8 text-muted-foreground"
                        >
                          Nessun movimento registrato corrispondente ai criteri.
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.map((log) => (
                        <TableRow
                          key={log.id}
                          className="hover:bg-muted/40 transition-colors border-b border-border/40 font-mono text-xs"
                        >
                          <TableCell className="text-muted-foreground">
                            #{log.id}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground font-sans">
                            {new Date(log.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="rounded-full text-[11px] font-sans"
                            >
                              {log.program_id || 'GENERAL'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold text-foreground">
                            {log.action}
                          </TableCell>
                          <TableCell>
                            {log.operator_id ? (
                              <span className="text-primary font-sans font-semibold">
                                Operatore ({log.wallet_address?.slice(0, 8)}...)
                              </span>
                            ) : (
                              <span>{log.wallet_address || 'Anonimo'}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {log.resource_type ? (
                              <span>
                                {log.resource_type}: {log.resource_id}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                log.status === 'SUCCESS'
                                  ? 'default'
                                  : log.status === 'UNAUTHORIZED'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                              className="rounded-full text-[10px] font-sans"
                            >
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedLog(log)}
                              className="rounded-full h-7 text-xs font-sans gap-1"
                            >
                              <FileText className="w-3.5 h-3.5" /> Dettagli
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Modal Dettagli Log */}
          {selectedLog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
              <Card className="w-full max-w-xl bg-background/95 backdrop-blur-2xl shadow-2xl border border-border/60 p-6 rounded-2xl space-y-4">
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <Text variant="h4" className="font-bold">
                        Audit Log Record #{selectedLog.id}
                      </Text>
                      <p className="text-xs text-muted-foreground font-mono">
                        Azione: {selectedLog.action} • {selectedLog.created_at}
                      </p>
                    </div>
                    <Badge
                      variant={
                        selectedLog.status === 'SUCCESS'
                          ? 'default'
                          : 'destructive'
                      }
                      className="rounded-full"
                    >
                      {selectedLog.status}
                    </Badge>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border/50 text-xs space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Programma:</span>
                      <span className="text-foreground">
                        {selectedLog.program_id}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Wallet:</span>
                      <span>{selectedLog.wallet_address || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Operatore ID:
                      </span>
                      <span>{selectedLog.operator_id || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IP / Client:</span>
                      <span>
                        {selectedLog.ip_address || '127.0.0.1'} (
                        {selectedLog.user_agent?.slice(0, 30)}...)
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      JSON Payload & Metadata:
                    </span>
                    <pre className="p-3 rounded-xl bg-card border border-border/50 text-xs font-mono overflow-x-auto max-h-48">
                      {JSON.stringify(
                        {
                          metadata: selectedLog.metadata,
                          old_state: selectedLog.old_state,
                          new_state: selectedLog.new_state,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      variant="ghost"
                      onClick={() => setSelectedLog(null)}
                      className="rounded-full"
                    >
                      Chiudi
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ISPEZIONE MESSAGGI */}
      {activeTab === 'messages' && (
        <div className="space-y-4">
          {!canViewMessages ? (
            <Card className="bg-background/50 border border-border/50 p-8 rounded-2xl text-center">
              <CardContent className="space-y-3">
                <Lock className="w-8 h-8 text-destructive mx-auto" />
                <Text variant="h4" className="font-bold">
                  Accesso Non Autorizzato
                </Text>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Il tuo ruolo ({(currentOp.roles ?? []).join(', ') || 'OPERATOR'}) non dispone del
                  permesso <code>MESSAGES_INSPECTOR:VIEW</code>. Seleziona un
                  operatore con privilegi superiori dal selettore in alto.
                </p>

              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Conversazioni */}
              <div className="lg:col-span-1 space-y-3">
                <div className="flex justify-between items-center">
                  <Text variant="h4" className="text-sm font-semibold">
                    Conversazioni Utenti
                  </Text>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={fetchConversations}
                    disabled={messagesLoading}
                    className="h-7 text-xs rounded-full"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" /> Aggiorna
                  </Button>
                </div>

                <div className="space-y-2">
                  {conversations.map((conv) => {
                    const isSelected = activeConvId === conv.id
                    return (
                      <div
                        key={conv.id}
                        onClick={() => handleOpenTranscript(conv.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-1.5 ${
                          isSelected
                            ? 'bg-card border-primary/50 shadow-md'
                            : 'bg-card/40 border-border/40 hover:bg-card/70'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold">
                            {conv.user_a_wallet} ↔ {conv.user_b_wallet}
                          </span>
                          {conv.has_report && (
                            <Badge
                              variant="destructive"
                              className="rounded-full text-[10px] px-1.5 py-0"
                            >
                              Segnalata
                            </Badge>
                          )}
                        </div>
                        {conv.trade_id && (
                          <p className="text-[11px] text-muted-foreground font-mono">
                            Trade: {conv.trade_id}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground truncate">
                          &quot;{conv.last_message}&quot;
                        </p>
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground/80 pt-1">
                          <span>{conv.total_messages} messaggi totali</span>
                          <span>
                            {new Date(
                              conv.last_message_at
                            ).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Right Column: Transcript View */}
              <div className="lg:col-span-2">
                <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl min-h-[420px] flex flex-col justify-between">
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center border-b border-border/50 pb-3">
                      <div>
                        <Text variant="h4" className="font-bold">
                          Transcript Conversazione Utenti
                        </Text>
                        <p className="text-xs text-muted-foreground">
                          {activeConvId
                            ? `Ispezione thread ID: ${activeConvId}`
                            : 'Seleziona una conversazione dall’elenco a sinistra per visualizzare i messaggi'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Audit Log Attivo</span>
                      </div>
                    </div>

                    {!activeConvId ? (
                      <div className="py-24 text-center text-muted-foreground space-y-2">
                        <MessageSquare className="w-10 h-10 mx-auto opacity-40" />
                        <p className="text-sm">
                          Nessuna conversazione selezionata.
                        </p>
                      </div>
                    ) : transcriptLoading ? (
                      <div className="py-24 text-center text-muted-foreground">
                        Caricamento transcript e registrazione audit log...
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-2">
                        {transcript.map((m) => (
                          <div
                            key={m.id}
                            className={`p-3 rounded-2xl text-xs space-y-1 ${
                              m.flagged
                                ? 'bg-destructive/10 border border-destructive/30'
                                : 'bg-card border border-border/40'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-mono font-semibold text-foreground">
                                {m.sender_wallet}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(m.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-foreground text-sm font-sans">
                              {m.content}
                            </p>
                            {m.flagged && (
                              <div className="flex items-center gap-1 text-[10px] text-destructive pt-1">
                                <AlertTriangle className="w-3 h-3" />
                                <span>
                                  Messaggio segnalato per sospetta violazione
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PROGRAMMI, RUOLI & PERMESSI (RBAC MATRIX) */}
      {activeTab === 'rbac' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <Text variant="h4" className="font-bold">
                Matrice Autorizzativa: Programmi ↔ Ruoli ↔ Permessi
              </Text>
              <p className="text-xs text-muted-foreground">
                Configura i permessi granulari per ciascun ruolo operativo. Le
                modifiche sono applicate in tempo reale.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <FullDropdown
                label="Ruolo Selezionato"
                value={matrixRole}
                options={DEFAULT_ROLES.map((r) => ({
                  label: r.name,
                  value: r.id,
                }))}
                onSelect={(val) => setMatrixRole(val)}
              />
            </div>
          </div>

          <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/50">
                      <TableHead className="font-semibold min-w-[200px]">
                        Programma / Modulo
                      </TableHead>
                      <TableHead className="font-semibold">Categoria</TableHead>
                      {DEFAULT_PERMISSIONS.map((perm) => (
                        <TableHead
                          key={perm.id}
                          className="text-center font-semibold text-xs whitespace-nowrap"
                        >
                          {perm.name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DEFAULT_PROGRAMS.map((prog) => (
                      <TableRow
                        key={prog.id}
                        className="hover:bg-muted/40 transition-colors border-b border-border/40"
                      >
                        <TableCell>
                          <div>
                            <span className="font-semibold text-foreground text-sm">
                              {prog.name}
                            </span>
                            <p className="text-xs text-muted-foreground font-mono">
                              {prog.id}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className="rounded-full text-[10px]"
                          >
                            {prog.category}
                          </Badge>
                        </TableCell>

                        {DEFAULT_PERMISSIONS.map((perm) => {
                          const isChecked = isPermissionEnabled(
                            prog.id,
                            matrixRole,
                            perm.id
                          )
                          const isSuperAdmin = matrixRole === 'SUPER_ADMIN'

                          return (
                            <TableCell key={perm.id} className="text-center">
                              <div className="flex justify-center items-center">
                                <Switch
                                  checked={isChecked}
                                  disabled={isSuperAdmin}
                                  onCheckedChange={(val) =>
                                    handlePermissionToggle(
                                      prog.id,
                                      perm.id,
                                      val
                                    )
                                  }
                                  size="sm"
                                  title={`${perm.name} su ${prog.name}`}
                                />
                              </div>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Anagrafica Operatori */}
          <div className="space-y-3">
            <Text variant="h4" className="font-bold">
              Anagrafica Operatori di Sistema
            </Text>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {operators.map((op) => (
                <Card
                  key={op.id}
                  className="bg-background/50 border border-border/50 p-4 rounded-2xl"
                >
                  <CardContent className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-sm text-foreground">
                          {op.full_name || op.username}
                        </span>
                        <p className="text-xs text-muted-foreground font-mono">
                          {op.email}
                        </p>
                      </div>
                      <Badge variant="default" className="rounded-full text-xs">
                        {op.status}
                      </Badge>
                    </div>
                    <div className="pt-2 border-t border-border/40 text-xs flex justify-between items-center font-mono">
                      <span className="text-muted-foreground">Ruolo:</span>
                      <span className="font-bold text-primary">
                        {(op.roles ?? []).join(', ') || 'OPERATOR'}
                      </span>
                    </div>

                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
