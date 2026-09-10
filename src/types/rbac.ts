/**
 * RBAC (Role-Based Access Control) & Audit Logger Types
 * CofferNode Platform
 */

export const OperatorStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED',
} as const
export type OperatorStatus = typeof OperatorStatus[keyof typeof OperatorStatus]

export const ReportStatus = {
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const
export type ReportStatus = typeof ReportStatus[keyof typeof ReportStatus]

export const ReportCategory = {
  SCAM_ATTEMPT: 'SCAM_ATTEMPT',
  ABUSIVE_MESSAGES: 'ABUSIVE_MESSAGES',
  PAYMENT_FRAUD: 'PAYMENT_FRAUD',
  IMPERSONATION: 'IMPERSONATION',
  OFF_PLATFORM_TRADING: 'OFF_PLATFORM_TRADING',
  TERMS_VIOLATION: 'TERMS_VIOLATION',
  OTHER: 'OTHER',
} as const
export type ReportCategory = typeof ReportCategory[keyof typeof ReportCategory]

export interface SysProgram {
  id: string // e.g. 'OPERATOR_PORTAL', 'AUDIT_LOGGER', 'USER_REPORTS', 'MESSAGES_INSPECTOR'
  name: string
  description?: string | null
  category: 'SYSTEM' | 'AUDIT' | 'COMPLIANCE' | 'SUPPORT' | 'TRADING' | 'DISPUTES' | 'SECURITY' | 'GENERAL'
  is_active: boolean
  created_at: string
}

export interface SysRole {
  id: string // e.g. 'SUPER_ADMIN', 'COMPLIANCE_LEAD', 'SUPPORT_OPERATOR', 'ARBITRATOR', 'AUDITOR_READONLY'
  name: string
  description?: string | null
  is_system: boolean
  created_at: string
}

export interface SysPermission {
  id: string // e.g. 'VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXECUTE', 'VIEW_PRIVATE_MESSAGES', 'RESOLVE_REPORT', 'MANAGE_OPERATORS', 'AUDIT_READ'
  name: string
  description?: string | null
  created_at: string
}

export interface SysProgramRolePermission {
  id: string
  program_id: string
  role_id: string
  permission_id: string
  created_at: string
}

export interface SysOperator {
  id: string
  user_id?: string | null
  wallet_address?: string | null
  username: string
  email: string
  full_name?: string | null
  status: OperatorStatus
  roles: string[] // Role IDs assigned to this operator
  last_login_at?: string | null
  created_at: string
  updated_at: string
}

export interface UserActivityLog {
  id: number | string
  user_id?: string | null
  operator_id?: string | null
  wallet_address?: string | null
  program_id?: string | null
  action: string // e.g. 'OFFER_CREATE', 'ESCROW_FUND', 'LOGIN', 'REPORT_SUBMIT', 'CHAT_INSPECT'
  resource_type?: string | null // e.g. 'trade', 'offer', 'dispute', 'chat_conversation', 'user_report'
  resource_id?: string | null
  old_state?: Record<string, unknown> | null
  new_state?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  status: 'SUCCESS' | 'FAILED' | 'UNAUTHORIZED' | 'ERROR'
  error_message?: string | null
  ip_address?: string | null
  user_agent?: string | null
  session_id?: string | null
  created_at: string
}

export interface UserReport {
  id: string
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
  status: ReportStatus
  resolution_notes?: string | null
  resolved_by_operator_id?: string | null
  resolved_at?: string | null
  created_at: string
  updated_at: string
}
