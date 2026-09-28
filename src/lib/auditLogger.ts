import { supabase } from '@/lib/supabase'
import type { UserActivityLog } from '@/types/rbac'

const ago = (min: number) => new Date(Date.now() - 1000 * 60 * min).toISOString()

// Local in-memory cache so offline/demo mode works without Supabase.
const IN_MEMORY_LOGS: UserActivityLog[] = [
  {
    id: 101,
    wallet_address: '0x71C...89A1',
    program_id: 'TRADES_MONITOR',
    action: 'ESCROW_DEPOSIT_INIT',
    resource_type: 'trade',
    resource_id: 'tr-99824',
    status: 'SUCCESS',
    metadata: { token: 'USDT', amount: 500, fiat: 'EUR' },
    ip_address: '192.168.1.42',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    created_at: ago(12),
  },
  {
    id: 102,
    wallet_address: '0x34B...44D2',
    program_id: 'OFFERS_MANAGEMENT',
    action: 'OFFER_CREATE',
    resource_type: 'offer',
    resource_id: 'off-771',
    status: 'SUCCESS',
    metadata: { type: 'sell', token: 'ETH', price: 3450 },
    ip_address: '82.55.10.12',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    created_at: ago(35),
  },
  {
    id: 103,
    wallet_address: '0x889...AA10',
    program_id: 'USER_REPORTS',
    action: 'REPORT_SUBMIT',
    resource_type: 'user_report',
    resource_id: 'rep-001',
    status: 'SUCCESS',
    metadata: { reason: 'Suspicious payment proof', accused: '0xBad...9999' },
    ip_address: '93.41.22.8',
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)',
    created_at: ago(90),
  },
  {
    id: 104,
    operator_id: '10000000-0000-0000-0000-000000000001',
    wallet_address: '0x1111111111111111111111111111111111111111',
    program_id: 'MESSAGES_INSPECTOR',
    action: 'INSPECT_USER_CHAT',
    resource_type: 'chat_conversation',
    resource_id: 'conv-trade-99824',
    status: 'SUCCESS',
    metadata: { note: 'Inspection following scam report' },
    ip_address: '10.0.0.1',
    user_agent: 'Mozilla/5.0 (Operator-Client v1)',
    created_at: ago(120),
  },
]

interface LogActivityParams {
  user_id?: string | null
  operator_id?: string | null
  wallet_address?: string | null
  program_id?: string | null
  action: string
  resource_type?: string | null
  resource_id?: string | null
  old_state?: Record<string, unknown> | null
  new_state?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  status?: 'SUCCESS' | 'FAILED' | 'UNAUTHORIZED' | 'ERROR'
  error_message?: string | null
}

export async function logUserActivity(params: LogActivityParams): Promise<UserActivityLog> {
  const newLog: UserActivityLog = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    user_id: params.user_id || null,
    operator_id: params.operator_id || null,
    wallet_address: params.wallet_address || null,
    program_id: params.program_id || 'GENERAL',
    action: params.action,
    resource_type: params.resource_type || null,
    resource_id: params.resource_id || null,
    old_state: params.old_state || null,
    new_state: params.new_state || null,
    metadata: params.metadata || {},
    status: params.status || 'SUCCESS',
    error_message: params.error_message || null,
    ip_address: typeof window !== 'undefined' ? '127.0.0.1' : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    created_at: new Date().toISOString(),
  }
  IN_MEMORY_LOGS.unshift(newLog)

  try {
    const { data, error } = await supabase
      .from('user_activity_logs')
      .insert({
        user_id: newLog.user_id,
        operator_id: newLog.operator_id,
        wallet_address: newLog.wallet_address,
        program_id: newLog.program_id,
        action: newLog.action,
        resource_type: newLog.resource_type,
        resource_id: newLog.resource_id,
        old_state: newLog.old_state,
        new_state: newLog.new_state,
        metadata: newLog.metadata,
        status: newLog.status,
        error_message: newLog.error_message,
        user_agent: newLog.user_agent,
      })
      .select()
      .maybeSingle()
    if (error) console.warn('[auditLogger] log insert failed, kept in memory:', error)
    else if (data) return data as UserActivityLog
  } catch (err) {
    console.warn('[auditLogger] log insert threw, kept in memory:', err)
  }

  return newLog
}

export interface ListLogsFilters {
  wallet?: string
  program_id?: string
  action?: string
  status?: string
  limit?: number
}

export async function listUserActivityLogs(filters?: ListLogsFilters): Promise<UserActivityLog[]> {
  try {
    let query = supabase.from('user_activity_logs').select('*').order('created_at', { ascending: false })
    if (filters?.wallet) query = query.ilike('wallet_address', `%${filters.wallet}%`)
    if (filters?.program_id && filters.program_id !== 'all') query = query.eq('program_id', filters.program_id)
    if (filters?.action) query = query.ilike('action', `%${filters.action}%`)
    if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status)
    if (filters?.limit) query = query.limit(filters.limit)

    const { data, error } = await query
    if (error) console.warn('[auditLogger] log query failed, using memory:', error)
    else if (data && data.length > 0) return data as UserActivityLog[]
  } catch (err) {
    console.warn('[auditLogger] log query threw, using memory:', err)
  }

  let result = [...IN_MEMORY_LOGS]
  if (filters?.wallet) {
    const w = filters.wallet.toLowerCase()
    result = result.filter((l) => l.wallet_address?.toLowerCase().includes(w))
  }
  if (filters?.program_id && filters.program_id !== 'all') {
    result = result.filter((l) => l.program_id === filters.program_id)
  }
  if (filters?.action) {
    const a = filters.action.toLowerCase()
    result = result.filter((l) => l.action.toLowerCase().includes(a))
  }
  if (filters?.status && filters.status !== 'all') {
    result = result.filter((l) => l.status === filters.status)
  }
  if (filters?.limit) result = result.slice(0, filters.limit)

  return result
}
