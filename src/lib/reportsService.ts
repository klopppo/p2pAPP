import { supabase } from '@/lib/supabase'
import { logUserActivity } from '@/lib/auditLogger'
import { getCurrentOperator, hasPermission } from '@/lib/operatorService'
import type { UserReport, ReportCategory, ReportStatus } from '@/types/rbac'

const IN_MEMORY_REPORTS: UserReport[] = [
  {
    id: 'rep-001',
    reporter_wallet: '0x889...AA10',
    reported_wallet: '0xBad...9999',
    category: 'OFF_PLATFORM_TRADING',
    reason: 'L’utente ha tentato insistentemente di spostare la conversazione su Telegram per evitare l’escrow CofferNode.',
    evidence_urls: [],
    conversation_id: 'conv-03',
    status: 'PENDING',
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: 'rep-002',
    reporter_wallet: '0x71C...89A1',
    reported_wallet: '0xBad...9999',
    category: 'PAYMENT_FRAUD',
    reason: 'Ha inviato una ricevuta di bonifico bancario fittizia e modificata graficamente, pretendendo il rilascio immediato dell’escrow.',
    trade_id: 'tr-99824',
    conversation_id: 'conv-01',
    status: 'IN_REVIEW',
    created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 'rep-003',
    reporter_wallet: '0x34B...44D2',
    reported_wallet: '0xAbc...1234',
    category: 'ABUSIVE_MESSAGES',
    reason: 'Linguaggio offensivo e minacce durante la discussione sul prezzo del cambio.',
    status: 'RESOLVED',
    resolution_notes: 'Utente ammonito formalmente e messaggio offensivo rimosso.',
    resolved_by_operator_id: '10000000-0000-0000-0000-000000000001',
    resolved_at: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
  },
]

export interface CreateReportParams {
  reporter_user_id?: string | null
  reporter_wallet: string
  reported_user_id?: string | null
  reported_wallet: string
  category: ReportCategory
  reason: string
  evidence_urls?: string[]
  trade_id?: string | null
  dispute_id?: string | null
  conversation_id?: string | null
  message_id?: string | null
}

/**
 * Invia una nuova segnalazione utente
 */
export async function createUserReport(params: CreateReportParams): Promise<UserReport> {
  const newReport: UserReport = {
    id: `rep-${Date.now().toString().slice(-6)}`,
    reporter_user_id: params.reporter_user_id || null,
    reporter_wallet: params.reporter_wallet,
    reported_user_id: params.reported_user_id || null,
    reported_wallet: params.reported_wallet,
    category: params.category,
    reason: params.reason,
    evidence_urls: params.evidence_urls || [],
    trade_id: params.trade_id || null,
    dispute_id: params.dispute_id || null,
    conversation_id: params.conversation_id || null,
    message_id: params.message_id || null,
    status: 'PENDING',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  IN_MEMORY_REPORTS.unshift(newReport)

  // Logga l'azione di invio segnalazione
  await logUserActivity({
    wallet_address: params.reporter_wallet,
    user_id: params.reporter_user_id,
    program_id: 'USER_REPORTS',
    action: 'REPORT_SUBMIT',
    resource_type: 'user_report',
    resource_id: newReport.id,
    metadata: {
      category: newReport.category,
      reported_wallet: newReport.reported_wallet,
      trade_id: newReport.trade_id,
      conversation_id: newReport.conversation_id,
    },
  })

  // Salva su Supabase se disponibile
  try {
    const { data, error } = await supabase.from('user_reports').insert({
      reporter_user_id: newReport.reporter_user_id,
      reporter_wallet: newReport.reporter_wallet,
      reported_user_id: newReport.reported_user_id,
      reported_wallet: newReport.reported_wallet,
      category: newReport.category,
      reason: newReport.reason,
      evidence_urls: newReport.evidence_urls,
      trade_id: newReport.trade_id,
      dispute_id: newReport.dispute_id,
      conversation_id: newReport.conversation_id,
      message_id: newReport.message_id,
      status: newReport.status,
    }).select().maybeSingle()

    if (!error && data) {
      return data as UserReport
    }
  } catch {
    // Ignora errori di rete
  }

  return newReport
}

export interface ListReportsFilters {
  status?: string
  category?: string
  reported_wallet?: string
}

/**
 * Recupera l'elenco delle segnalazioni per gli operatori
 */
export async function listUserReports(filters?: ListReportsFilters): Promise<UserReport[]> {
  try {
    let query = supabase.from('user_reports').select('*').order('created_at', { ascending: false })
    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status)
    }
    if (filters?.category && filters.category !== 'all') {
      query = query.eq('category', filters.category)
    }
    if (filters?.reported_wallet) {
      query = query.ilike('reported_wallet', `%${filters.reported_wallet}%`)
    }

    const { data, error } = await query
    if (!error && data && data.length > 0) {
      return data as UserReport[]
    }
  } catch {
    // Fallback locale
  }

  let result = [...IN_MEMORY_REPORTS]
  if (filters?.status && filters.status !== 'all') {
    result = result.filter(r => r.status === filters.status)
  }
  if (filters?.category && filters.category !== 'all') {
    result = result.filter(r => r.category === filters.category)
  }
  if (filters?.reported_wallet) {
    const w = filters.reported_wallet.toLowerCase()
    result = result.filter(r => r.reported_wallet.toLowerCase().includes(w))
  }

  return result
}

/**
 * Risolvi o aggiorna lo stato di una segnalazione da parte di un operatore
 */
export async function resolveUserReport(
  reportId: string,
  operatorId: string,
  status: ReportStatus,
  notes?: string
): Promise<UserReport> {
  const currentOp = getCurrentOperator()
  const canResolve = hasPermission(currentOp.roles, 'USER_REPORTS', 'RESOLVE_REPORT')
  if (!canResolve) {
    throw new Error('Accesso negato: Permesso USER_REPORTS:RESOLVE_REPORT mancante')
  }

  const now = new Date().toISOString()

  // In-memory (seed/demo) report — mutate in place, then best-effort persist.
  const inMemory = IN_MEMORY_REPORTS.find(r => r.id === reportId)
  if (inMemory) {
    const oldState = { ...inMemory }
    inMemory.status = status
    inMemory.resolution_notes = notes || inMemory.resolution_notes
    inMemory.resolved_by_operator_id = operatorId
    inMemory.resolved_at = now
    inMemory.updated_at = now

    await logUserActivity({
      operator_id: operatorId,
      wallet_address: currentOp.wallet_address,
      program_id: 'USER_REPORTS',
      action: status === 'RESOLVED' ? 'RESOLVE_USER_REPORT' : 'UPDATE_REPORT_STATUS',
      resource_type: 'user_report',
      resource_id: reportId,
      old_state: { status: oldState.status, notes: oldState.resolution_notes },
      new_state: { status: inMemory.status, notes: inMemory.resolution_notes },
      metadata: { operator_username: currentOp.username },
    })

    try {
      await supabase.from('user_reports').update({
        status: inMemory.status,
        resolution_notes: inMemory.resolution_notes,
        resolved_by_operator_id: inMemory.resolved_by_operator_id,
        resolved_at: inMemory.resolved_at,
        updated_at: inMemory.updated_at,
      }).eq('id', reportId)
    } catch {
      // offline fallback
    }

    return inMemory
  }

  // DB-backed report (the real path in a populated environment). The old code
  // only searched IN_MEMORY_REPORTS and threw for every row loaded from
  // Supabase, so resolving a real report from the dashboard always failed.
  const { data: existingData } = await supabase
    .from('user_reports')
    .select('*')
    .eq('id', reportId)
    .maybeSingle()
  const existing = (existingData ?? null) as UserReport | null
  if (!existing) {
    throw new Error('Segnalazione non trovata')
  }

  const { data, error } = await supabase
    .from('user_reports')
    .update({
      status,
      resolution_notes: notes ?? existing.resolution_notes,
      resolved_by_operator_id: operatorId,
      resolved_at: now,
      updated_at: now,
    })
    .eq('id', reportId)
    .select()
    .single()
  if (error) throw error

  await logUserActivity({
    operator_id: operatorId,
    wallet_address: currentOp.wallet_address,
    program_id: 'USER_REPORTS',
    action: status === 'RESOLVED' ? 'RESOLVE_USER_REPORT' : 'UPDATE_REPORT_STATUS',
    resource_type: 'user_report',
    resource_id: reportId,
    old_state: { status: existing.status, notes: existing.resolution_notes },
    new_state: { status, notes: notes ?? existing.resolution_notes },
    metadata: { operator_username: currentOp.username },
  })

  return data as UserReport
}
