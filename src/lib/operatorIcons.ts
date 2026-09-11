import {
  AlertTriangle,
  Activity,
  CheckCircle2,
  Clock,
  CornerUpLeft,
  Eye,
  FileText,
  Filter,
  Hand,
  Headphones,
  Inbox,
  LoaderCircle,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  UserCheck,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import type { SupportThreadStatus } from '@/lib/supportChatService'

/**
 * Central registry of every icon used across the Operator & Compliance Portal.
 * Import from here instead of from lucide-react directly so the icon set stays
 * consistent in one place.
 */
export const OPERATOR_ICONS = {
  /** Icons for the dashboard tab navigation */
  tab: {
    support: Headphones,
    reports: ShieldAlert,
    logs: Activity,
    messages: MessageSquare,
    rbac: Lock,
  },
  /** Icons for the Stats Bento cards */
  stat: {
    reports: ShieldAlert,
    logs: Activity,
    operators: Users,
    support: Headphones,
  },
  /** Icons mapped to support ticket statuses */
  status: {
    OPEN: Clock,
    IN_PROGRESS: LoaderCircle,
    RESOLVED: CheckCircle2,
  } satisfies Record<SupportThreadStatus, LucideIcon>,
  /** Icons mapped to the last sender of a support thread */
  sender: {
    user: Inbox,
    operator: CornerUpLeft,
    system: Sparkles,
  },
  /** Icons for the operator quick-reply templates */
  quickReply: {
    greeting: Hand,
    escrow: ShieldCheck,
    resolved: ThumbsUp,
  },
  /** Generic functional icons reused across tabs */
  ui: {
    search: Search,
    refresh: RefreshCw,
    eye: Eye,
    fileText: FileText,
    xCircle: XCircle,
    clock: Clock,
    checkCircle: CheckCircle2,
    shieldAlert: ShieldAlert,
    lock: Lock,
    userCheck: UserCheck,
    filter: Filter,
    send: Send,
    sparkles: Sparkles,
    alertTriangle: AlertTriangle,
    message: MessageSquare,
  },
} as const