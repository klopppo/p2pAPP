import { describe, expect, it } from 'vitest'
import { logUserActivity, listUserActivityLogs } from '@/lib/auditLogger'
import {
  hasPermission,
  toggleRolePermission,
  isPermissionEnabled,
  getConversationTranscript,
  DEFAULT_PROGRAMS,
  DEFAULT_ROLES,
  DEFAULT_PERMISSIONS,
  createOperator,
  listOperators,
} from '@/lib/operatorService'
import {
  createUserReport,
  listUserReports,
  resolveUserReport,
} from '@/lib/reportsService'
import { ReportCategory } from '@/types/rbac'

describe('RBAC & Program-Role-Permission Matrix', () => {
  it('should seed standard programs, roles, and atomic permissions', () => {
    expect(DEFAULT_PROGRAMS.length).toBeGreaterThanOrEqual(5)
    expect(DEFAULT_ROLES.map((r) => r.id)).toContain('SUPER_ADMIN')
    expect(DEFAULT_ROLES.map((r) => r.id)).toContain('COMPLIANCE_LEAD')
    expect(DEFAULT_ROLES.map((r) => r.id)).toContain('SUPPORT_OPERATOR')
    expect(DEFAULT_PERMISSIONS.map((p) => p.id)).toContain('VIEW_PRIVATE_MESSAGES')
    expect(DEFAULT_PERMISSIONS.map((p) => p.id)).toContain('RESOLVE_REPORT')
    expect(DEFAULT_PERMISSIONS.map((p) => p.id)).toContain('AUDIT_READ')
  })

  it('SUPER_ADMIN should have universal permission across all programs', () => {
    expect(hasPermission(['SUPER_ADMIN'], 'OPERATOR_PORTAL', 'VIEW')).toBe(true)
    expect(hasPermission(['SUPER_ADMIN'], 'MESSAGES_INSPECTOR', 'VIEW_PRIVATE_MESSAGES')).toBe(true)
    expect(hasPermission(['SUPER_ADMIN'], 'RBAC_MANAGEMENT', 'MANAGE_OPERATORS')).toBe(true)
    expect(hasPermission(['SUPER_ADMIN'], 'AUDIT_LOGGER', 'DELETE')).toBe(true)
  })

  it('COMPLIANCE_LEAD and SUPPORT_OPERATOR should have fine-grained permissions', () => {
    // Compliance Lead
    expect(hasPermission(['COMPLIANCE_LEAD'], 'USER_REPORTS', 'RESOLVE_REPORT')).toBe(true)
    expect(hasPermission(['COMPLIANCE_LEAD'], 'AUDIT_LOGGER', 'AUDIT_READ')).toBe(true)
    expect(hasPermission(['COMPLIANCE_LEAD'], 'MESSAGES_INSPECTOR', 'VIEW_PRIVATE_MESSAGES')).toBe(true)
    expect(hasPermission(['COMPLIANCE_LEAD'], 'RBAC_MANAGEMENT', 'MANAGE_OPERATORS')).toBe(false)

    // Support Operator
    expect(hasPermission(['SUPPORT_OPERATOR'], 'USER_REPORTS', 'RESOLVE_REPORT')).toBe(true)
    expect(hasPermission(['SUPPORT_OPERATOR'], 'MESSAGES_INSPECTOR', 'VIEW_PRIVATE_MESSAGES')).toBe(true)
    expect(hasPermission(['SUPPORT_OPERATOR'], 'RBAC_MANAGEMENT', 'DELETE')).toBe(false)
  })

  it('should dynamically toggle role permissions in RBAC matrix', () => {
    const progId = 'TRADES_MONITOR'
    const roleId = 'AUDITOR_READONLY'
    const permId = 'DELETE'

    expect(isPermissionEnabled(progId, roleId, permId)).toBe(false)
    toggleRolePermission(progId, roleId, permId, true)
    expect(isPermissionEnabled(progId, roleId, permId)).toBe(true)
    toggleRolePermission(progId, roleId, permId, false)
    expect(isPermissionEnabled(progId, roleId, permId)).toBe(false)
  })

  it('should create new operators with assigned roles', async () => {
    const newOp = await createOperator({
      username: 'test_auditor_99',
      email: 'auditor99@coffernode.io',
      roles: ['AUDITOR_READONLY'],
    })

    expect(newOp.id).toBeDefined()
    expect(newOp.username).toBe('test_auditor_99')
    expect(newOp.roles).toContain('AUDITOR_READONLY')

    const allOps = await listOperators()
    expect(allOps.map((o) => o.username)).toContain('test_auditor_99')
  })
})

describe('Audit Logger Movimenti Utente', () => {
  it('should log movements and query them with filters', async () => {
    const testWallet = '0xTestLoggerWallet1234'
    const log = await logUserActivity({
      wallet_address: testWallet,
      program_id: 'TRADES_MONITOR',
      action: 'TEST_ESCROW_LOCK',
      resource_type: 'trade',
      resource_id: 'tr-test-100',
      status: 'SUCCESS',
      metadata: { amount: 250, token: 'USDC' },
    })

    expect(log.id).toBeDefined()
    expect(log.wallet_address).toBe(testWallet)
    expect(log.action).toBe('TEST_ESCROW_LOCK')

    const logs = await listUserActivityLogs({ wallet: testWallet })
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect(logs.some((l) => l.action === 'TEST_ESCROW_LOCK')).toBe(true)
  })
})

describe('User Reports (Segnalazioni) & Message Inspector', () => {
  it('should create user report, resolve it, and record audit log', async () => {
    const report = await createUserReport({
      reporter_wallet: '0xReporter1111',
      reported_wallet: '0xBadActor2222',
      category: ReportCategory.PAYMENT_FRAUD,
      reason: 'Ricevuta falsa caricata nel trade',
      trade_id: 'tr-99824',
    })

    expect(report.id).toBeDefined()
    expect(report.status).toBe('PENDING')
    expect(report.category).toBe('PAYMENT_FRAUD')

    const list = await listUserReports({ reported_wallet: '0xBadActor2222' })
    expect(list.length).toBeGreaterThanOrEqual(1)

    // Resolve report by operator
    const resolved = await resolveUserReport(
      report.id,
      '10000000-0000-0000-0000-000000000001',
      'RESOLVED',
      'Account ammonito e fondi restituiti al compratore'
    )

    expect(resolved.status).toBe('RESOLVED')
    expect(resolved.resolution_notes).toContain('Account ammonito')
  })

  it('should allow message transcript inspection for authorized operator and audit log it', async () => {
    const opId = '10000000-0000-0000-0000-000000000001' // SuperAdmin
    const transcript = await getConversationTranscript(opId, 'conv-01')

    expect(transcript.length).toBeGreaterThan(0)
    expect(transcript[0].sender_wallet).toBeDefined()

    // Verify audit log has the inspection logged
    const logs = await listUserActivityLogs({ action: 'INSPECT_USER_CHAT' })
    expect(logs.length).toBeGreaterThanOrEqual(1)
  })
})
