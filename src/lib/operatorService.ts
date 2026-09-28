import { supabase } from '@/lib/supabase'
import { logUserActivity } from '@/lib/auditLogger'
import type { SysProgram, SysRole, SysPermission, SysOperator } from '@/types/rbac'

const T0 = '2026-01-01T00:00:00Z'

export const DEFAULT_PROGRAMS: SysProgram[] = [
  { id: 'OPERATOR_PORTAL', name: 'Operator Portal Core', description: 'Pannello di controllo e overview operatori', category: 'SYSTEM', is_active: true, created_at: T0 },
  { id: 'AUDIT_LOGGER', name: 'Audit & Movements Logger', description: 'Consultazione log completi e telemetria azioni utente', category: 'AUDIT', is_active: true, created_at: T0 },
  { id: 'USER_REPORTS', name: 'User Reports / Segnalazioni', description: 'Gestione e risoluzione segnalazioni inviate dagli utenti', category: 'COMPLIANCE', is_active: true, created_at: T0 },
  { id: 'MESSAGES_INSPECTOR', name: 'User Messages Inspector', description: 'Ispezione e verifica chat e messaggistica utenti per segnalazioni', category: 'SUPPORT', is_active: true, created_at: T0 },
  { id: 'TRADES_MONITOR', name: 'Trades & Escrow Monitor', description: 'Controllo transazioni e stati contratti escrow', category: 'TRADING', is_active: true, created_at: T0 },
  { id: 'DISPUTES_CONSOLE', name: 'Disputes Console', description: 'Gestione controversie, evidenze e arbitraggio', category: 'DISPUTES', is_active: true, created_at: T0 },
  { id: 'RBAC_MANAGEMENT', name: 'RBAC & Operators Admin', description: 'Gestione ruoli, permessi e anagrafica operatori', category: 'SECURITY', is_active: true, created_at: T0 },
]

export const DEFAULT_ROLES: SysRole[] = [
  { id: 'SUPER_ADMIN', name: 'Super Administrator', description: 'Accesso completo a tutti i moduli, configurazione RBAC e audit', is_system: true, created_at: T0 },
  { id: 'COMPLIANCE_LEAD', name: 'Compliance Lead', description: 'Supervisione segnalazioni, audit utente e sanzioni', is_system: true, created_at: T0 },
  { id: 'SUPPORT_OPERATOR', name: 'Support Operator', description: 'Assistenza utenti, revisione chat segnalate e trades', is_system: true, created_at: T0 },
  { id: 'ARBITRATOR', name: 'Arbitrator / Dispute Resolver', description: 'Gestione e risoluzione controversie escrow', is_system: true, created_at: T0 },
  { id: 'AUDITOR_READONLY', name: 'Auditor (Read-Only)', description: 'Accesso in sola lettura ai log di audit e telemetria', is_system: true, created_at: T0 },
]

export const DEFAULT_PERMISSIONS: SysPermission[] = [
  { id: 'VIEW', name: 'Visualizzazione', description: 'Permesso di visualizzare dati e sezioni del programma', created_at: T0 },
  { id: 'CREATE', name: 'Creazione', description: 'Permesso di inserire nuovi record o risorse', created_at: T0 },
  { id: 'EDIT', name: 'Modifica', description: 'Permesso di modificare dati esistenti', created_at: T0 },
  { id: 'DELETE', name: 'Eliminazione', description: 'Permesso di eliminare risorse o disattivare voci', created_at: T0 },
  { id: 'EXECUTE', name: 'Esecuzione Azioni', description: 'Permesso di eseguire azioni di sistema o workflow', created_at: T0 },
  { id: 'VIEW_PRIVATE_MESSAGES', name: 'Lettura Messaggi Utenti', description: 'Permesso di accedere alle chat private per indagini/segnalazioni', created_at: T0 },
  { id: 'RESOLVE_REPORT', name: 'Risoluzione Segnalazioni', description: 'Permesso di chiudere o archiviare segnalazioni utenti', created_at: T0 },
  { id: 'MANAGE_OPERATORS', name: 'Gestione Operatori', description: 'Permesso di creare/modificare operatori e ruoli', created_at: T0 },
  { id: 'AUDIT_READ', name: 'Lettura Audit Log', description: 'Permesso di consultare i log dei movimenti utente', created_at: T0 },
]

// In-memory role-permission matrix: key = `${programId}:${roleId}:${permissionId}`.
const ROLE_PERMISSIONS_SET = new Set<string>([
  ...DEFAULT_PROGRAMS.flatMap((p) => DEFAULT_PERMISSIONS.map((perm) => `${p.id}:SUPER_ADMIN:${perm.id}`)),
  'OPERATOR_PORTAL:COMPLIANCE_LEAD:VIEW', 'AUDIT_LOGGER:COMPLIANCE_LEAD:VIEW', 'AUDIT_LOGGER:COMPLIANCE_LEAD:AUDIT_READ',
  'USER_REPORTS:COMPLIANCE_LEAD:VIEW', 'USER_REPORTS:COMPLIANCE_LEAD:EDIT', 'USER_REPORTS:COMPLIANCE_LEAD:RESOLVE_REPORT',
  'MESSAGES_INSPECTOR:COMPLIANCE_LEAD:VIEW', 'MESSAGES_INSPECTOR:COMPLIANCE_LEAD:VIEW_PRIVATE_MESSAGES',
  'TRADES_MONITOR:COMPLIANCE_LEAD:VIEW', 'DISPUTES_CONSOLE:COMPLIANCE_LEAD:VIEW',
  'OPERATOR_PORTAL:SUPPORT_OPERATOR:VIEW', 'USER_REPORTS:SUPPORT_OPERATOR:VIEW', 'USER_REPORTS:SUPPORT_OPERATOR:RESOLVE_REPORT',
  'MESSAGES_INSPECTOR:SUPPORT_OPERATOR:VIEW', 'MESSAGES_INSPECTOR:SUPPORT_OPERATOR:VIEW_PRIVATE_MESSAGES',
  'TRADES_MONITOR:SUPPORT_OPERATOR:VIEW', 'DISPUTES_CONSOLE:SUPPORT_OPERATOR:VIEW',
  'OPERATOR_PORTAL:ARBITRATOR:VIEW', 'DISPUTES_CONSOLE:ARBITRATOR:VIEW', 'DISPUTES_CONSOLE:ARBITRATOR:EXECUTE',
  'MESSAGES_INSPECTOR:ARBITRATOR:VIEW', 'MESSAGES_INSPECTOR:ARBITRATOR:VIEW_PRIVATE_MESSAGES', 'TRADES_MONITOR:ARBITRATOR:VIEW',
  'OPERATOR_PORTAL:AUDITOR_READONLY:VIEW', 'AUDIT_LOGGER:AUDITOR_READONLY:VIEW', 'AUDIT_LOGGER:AUDITOR_READONLY:AUDIT_READ',
  'USER_REPORTS:AUDITOR_READONLY:VIEW', 'TRADES_MONITOR:AUDITOR_READONLY:VIEW',
])

const OPERATORS_LIST: SysOperator[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    wallet_address: '0x1111111111111111111111111111111111111111',
    username: 'admin_sarah',
    email: 'sarah.admin@coffernode.io',
    full_name: 'Sarah Jenkins',
    status: 'ACTIVE',
    roles: ['SUPER_ADMIN'],
    last_login_at: new Date().toISOString(),
    created_at: T0,
    updated_at: T0,
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    wallet_address: '0x2222222222222222222222222222222222222222',
    username: 'compliance_marco',
    email: 'marco.c@coffernode.io',
    full_name: 'Marco Rossi',
    status: 'ACTIVE',
    roles: ['COMPLIANCE_LEAD'],
    last_login_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    wallet_address: '0x3333333333333333333333333333333333333333',
    username: 'support_elena',
    email: 'elena.support@coffernode.io',
    full_name: 'Elena Bianchi',
    status: 'ACTIVE',
    roles: ['SUPPORT_OPERATOR'],
    last_login_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    created_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
  },
]

let CURRENT_OPERATOR_ID = OPERATORS_LIST[0].id

export function getCurrentOperator(): SysOperator {
  const current = OPERATORS_LIST.find((o) => o.id === CURRENT_OPERATOR_ID) || OPERATORS_LIST[0]
  // Least privilege: an operator with no roles gets NO permissions.
  return { ...current, roles: Array.isArray(current.roles) ? current.roles : [] }
}

/**
 * Resolve the signed-in operator from the SERVER. RLS returns only the
 * caller's own ACTIVE row, so the portal can't be driven by a client-chosen
 * operator id. Falls back to a role-less shell (least privilege) — never the
 * SUPER_ADMIN seed, so a failed resolution can't grant portal permissions.
 * The switcher below re-applies roles for operators the user explicitly picks.
 */
export async function resolveCurrentOperator(): Promise<SysOperator> {
  try {
    const { data: id, error: idErr } = await supabase.rpc('current_operator_id')
    if (idErr) console.warn('[operatorService] current_operator_id failed:', idErr)
    if (id) {
      const { data, error } = await supabase.from('sys_operators').select('*').eq('id', id).maybeSingle()
      if (error) console.warn('[operatorService] operator row read failed:', error)
      if (!error && data) {
        const op = data as SysOperator
        if (op.id) CURRENT_OPERATOR_ID = op.id
        return { ...op, roles: Array.isArray(op.roles) ? op.roles : [] }
      }
    }
  } catch (err) {
    // Fall through to the least-privilege fallback.
    console.warn('[operatorService] server operator resolve failed:', err)
  }
  return { ...getCurrentOperator(), roles: [] }
}

export function setCurrentOperator(operatorId: string): SysOperator {
  const found = OPERATORS_LIST.find((o) => o.id === operatorId)
  if (found) CURRENT_OPERATOR_ID = found.id
  return getCurrentOperator()
}

export async function listOperators(): Promise<SysOperator[]> {
  const withDefaultRole = (op: SysOperator): SysOperator => ({
    ...op,
    roles: Array.isArray(op.roles) && op.roles.length > 0 ? op.roles : ['SUPPORT_OPERATOR'],
  })
  try {
    const { data, error } = await supabase.from('sys_operators').select('*')
    if (!error && data && data.length > 0) {
      const dbOps = (data as SysOperator[]).map(withDefaultRole)
      for (const localOp of OPERATORS_LIST) {
        if (!dbOps.some((d) => d.id === localOp.id || d.username === localOp.username)) {
          dbOps.push(localOp)
        }
      }
      return dbOps
    }
    if (error) console.warn('[operatorService] listOperators failed:', error)
  } catch (err) {
    console.warn('[operatorService] listOperators threw:', err)
  }
  return OPERATORS_LIST.map(withDefaultRole)
}

export async function createOperator(params: {
  username: string
  email: string
  full_name?: string
  wallet_address?: string
  roles: string[]
}): Promise<SysOperator> {
  const newOp: SysOperator = {
    id: `op-${Date.now()}`,
    username: params.username,
    email: params.email,
    full_name: params.full_name,
    wallet_address: params.wallet_address,
    status: 'ACTIVE',
    roles: params.roles.length > 0 ? params.roles : ['SUPPORT_OPERATOR'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  OPERATORS_LIST.push(newOp)

  await logUserActivity({
    operator_id: CURRENT_OPERATOR_ID,
    program_id: 'RBAC_MANAGEMENT',
    action: 'CREATE_OPERATOR',
    resource_type: 'sys_operator',
    resource_id: newOp.id,
    new_state: { username: newOp.username, email: newOp.email, roles: newOp.roles },
  })

  return newOp
}

export function hasPermission(roles: string[] | undefined, programId: string, permissionId: string): boolean {
  const effectiveRoles = Array.isArray(roles) ? roles : ['SUPPORT_OPERATOR']
  if (effectiveRoles.includes('SUPER_ADMIN')) return true
  return effectiveRoles.some((roleId) => ROLE_PERMISSIONS_SET.has(`${programId}:${roleId}:${permissionId}`))
}

export function isPermissionEnabled(programId: string, roleId: string, permissionId: string): boolean {
  if (roleId === 'SUPER_ADMIN') return true
  return ROLE_PERMISSIONS_SET.has(`${programId}:${roleId}:${permissionId}`)
}

export function toggleRolePermission(
  programId: string,
  roleId: string,
  permissionId: string,
  enable: boolean
): boolean {
  if (roleId === 'SUPER_ADMIN') return true
  const key = `${programId}:${roleId}:${permissionId}`
  if (enable) ROLE_PERMISSIONS_SET.add(key)
  else ROLE_PERMISSIONS_SET.delete(key)

  logUserActivity({
    operator_id: CURRENT_OPERATOR_ID,
    program_id: 'RBAC_MANAGEMENT',
    action: enable ? 'GRANT_PERMISSION' : 'REVOKE_PERMISSION',
    resource_type: 'role_permission',
    resource_id: key,
    metadata: { program_id: programId, role_id: roleId, permission_id: permissionId },
  })

  return true
}

export interface InspectableConversation {
  id: string
  trade_id?: string | null
  user_a_wallet: string
  user_b_wallet: string
  last_message?: string
  last_message_at: string
  total_messages: number
  has_report: boolean
}

export interface InspectableMessage {
  id: string
  sender_wallet: string
  content: string
  created_at: string
  has_attachment?: boolean
  flagged?: boolean
}

const ago = (min: number) => new Date(Date.now() - 1000 * 60 * min).toISOString()

const MOCK_CONVERSATIONS: InspectableConversation[] = [
  { id: 'conv-01', trade_id: 'tr-99824', user_a_wallet: '0x71C...89A1', user_b_wallet: '0xBad...9999', last_message: 'Ho inviato il bonifico, sblocca i fondi subito!', last_message_at: ago(15), total_messages: 8, has_report: true },
  { id: 'conv-02', trade_id: 'tr-88123', user_a_wallet: '0x34B...44D2', user_b_wallet: '0x555...1234', last_message: 'Grazie mille per lo scambio rapido!', last_message_at: ago(120), total_messages: 5, has_report: false },
  { id: 'conv-03', trade_id: null, user_a_wallet: '0x889...AA10', user_b_wallet: '0xBad...9999', last_message: 'Contattami su Telegram @scammy per fare trade senza escrow', last_message_at: ago(80), total_messages: 3, has_report: true },
]

const MOCK_TRANSCRIPTS: Record<string, InspectableMessage[]> = {
  'conv-01': [
    { id: 'm-1', sender_wallet: '0x71C...89A1', content: 'Ciao, sono pronto per il trade di 500 USDT.', created_at: '2026-09-10T10:00:00Z' },
    { id: 'm-2', sender_wallet: '0xBad...9999', content: 'Ok mandami i soldi su questo IBAN falso IT99X000000000.', created_at: '2026-09-10T10:02:00Z' },
    { id: 'm-3', sender_wallet: '0x71C...89A1', content: 'La ricevuta che hai inviato sembra alterata con Photoshop.', created_at: '2026-09-10T10:10:00Z' },
    { id: 'm-4', sender_wallet: '0xBad...9999', content: 'Ho inviato il bonifico, sblocca i fondi subito!', created_at: '2026-09-10T10:15:00Z', flagged: true },
  ],
  'conv-02': [
    { id: 'm-21', sender_wallet: '0x34B...44D2', content: 'Ciao, escrow bloccato con successo.', created_at: '2026-09-10T08:00:00Z' },
    { id: 'm-22', sender_wallet: '0x555...1234', content: 'Ricevuto, ti invio il pagamento Revolut.', created_at: '2026-09-10T08:05:00Z' },
    { id: 'm-23', sender_wallet: '0x34B...44D2', content: 'Grazie mille per lo scambio rapido!', created_at: '2026-09-10T08:15:00Z' },
  ],
  'conv-03': [
    { id: 'm-31', sender_wallet: '0xBad...9999', content: 'Ehi vuoi comprare USDT a sconto del 10%?', created_at: '2026-09-10T09:00:00Z' },
    { id: 'm-32', sender_wallet: '0x889...AA10', content: 'Possiamo fare tramite escrow CofferNode?', created_at: '2026-09-10T09:02:00Z' },
    { id: 'm-33', sender_wallet: '0xBad...9999', content: 'Contattami su Telegram @scammy per fare trade senza escrow', created_at: '2026-09-10T09:05:00Z', flagged: true },
  ],
}

export async function listInspectableConversations(operatorId: string): Promise<InspectableConversation[]> {
  const currentOp = OPERATORS_LIST.find((o) => o.id === operatorId) || getCurrentOperator()
  if (!hasPermission(currentOp.roles, 'MESSAGES_INSPECTOR', 'VIEW')) {
    throw new Error('Accesso negato: Permesso MESSAGES_INSPECTOR:VIEW mancante')
  }
  return [...MOCK_CONVERSATIONS]
}

export async function getConversationTranscript(
  operatorId: string,
  conversationId: string
): Promise<InspectableMessage[]> {
  const currentOp = OPERATORS_LIST.find((o) => o.id === operatorId) || getCurrentOperator()
  if (!hasPermission(currentOp.roles, 'MESSAGES_INSPECTOR', 'VIEW_PRIVATE_MESSAGES')) {
    await logUserActivity({
      operator_id: currentOp.id,
      wallet_address: currentOp.wallet_address,
      program_id: 'MESSAGES_INSPECTOR',
      action: 'UNAUTHORIZED_CHAT_INSPECT_ATTEMPT',
      resource_type: 'chat_conversation',
      resource_id: conversationId,
      status: 'UNAUTHORIZED',
      error_message: 'Permission VIEW_PRIVATE_MESSAGES missing',
    })
    throw new Error('Accesso negato: Permesso VIEW_PRIVATE_MESSAGES non abilitato per il tuo ruolo')
  }

  await logUserActivity({
    operator_id: currentOp.id,
    wallet_address: currentOp.wallet_address,
    program_id: 'MESSAGES_INSPECTOR',
    action: 'INSPECT_USER_CHAT',
    resource_type: 'chat_conversation',
    resource_id: conversationId,
    status: 'SUCCESS',
    metadata: { operator_username: currentOp.username },
  })

  return MOCK_TRANSCRIPTS[conversationId] || []
}
