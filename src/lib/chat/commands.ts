import type { ConversationView } from '@/types/database'

export interface ChatCommand {
  name: string
  /** Slash-trigger, e.g. "/help" */
  trigger: string
  /** Short description shown in the command menu */
  description: string
  /** Optional category for grouping */
  category: 'info' | 'trade' | 'action'
  /** Icon name (lucide) */
  icon: string
  /** Execute the command — returns a system message body to insert into the chat */
  execute: (ctx: CommandContext) => CommandResult
}

export interface CommandContext {
  conversation: ConversationView | null
  currentUserId: string
}

export type CommandResult =
  | { kind: 'message'; body: string }
  | { kind: 'navigate'; path: string }
  | { kind: 'none' }

// ── Helpers ──────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const ESCROW_LABELS: Record<string, string> = {
  awaiting_deposit: 'Awaiting Deposit',
  deposited: 'Deposited',
  pending_release: 'Pending Release',
  disputed: 'Disputed',
  released: 'Released',
  refunded: 'Refunded',
}

const TRADE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  refunded: 'Refunded',
}

// ── Commands ─────────────────────────────────────────────────────────

export const CHAT_COMMANDS: ChatCommand[] = [
  // ── Info ──
  {
    name: 'Help',
    trigger: '/help',
    description: 'Show all available commands',
    category: 'info',
    icon: 'CircleHelp',
    execute: () => ({
      kind: 'message',
      body: [
        'Available commands:',
        '  /help — Show this list',
        '  /trade — Show trade summary',
        '  /status — Escrow & trade status',
        '  /amount — Trade amount breakdown',
        '  /payment — Payment method & details',
        '  /who — Partner wallet & role',
        '  /dispute — Link to open a dispute',
        '  /profile — Partner profile link',
      ].join('\n'),
    }),
  },

  // ── Trade ──
  {
    name: 'Trade Summary',
    trigger: '/trade',
    description: 'Show trade details',
    category: 'trade',
    icon: 'Receipt',
    execute: ({ conversation }) => {
      const t = conversation?.trade
      if (!t) return { kind: 'message', body: 'No trade linked to this conversation.' }
      return {
        kind: 'message',
        body: [
          `Trade ${t.trade_id}`,
          `  ${t.crypto_amount} ${t.crypto_token} × $${t.crypto_price_per_unit}`,
          `  ${t.fiat_amount} ${t.fiat_currency}`,
          `  Status: ${TRADE_STATUS_LABELS[t.status] ?? t.status}`,
        ].join('\n'),
      }
    },
  },

  {
    name: 'Status',
    trigger: '/status',
    description: 'Escrow & trade status',
    category: 'trade',
    icon: 'Activity',
    execute: ({ conversation }) => {
      const t = conversation?.trade
      if (!t) return { kind: 'message', body: 'No trade linked to this conversation.' }
      return {
        kind: 'message',
        body: [
          `Trade: ${TRADE_STATUS_LABELS[t.status] ?? t.status}`,
          `Escrow: ${ESCROW_LABELS[t.escrow_status] ?? t.escrow_status}`,
        ].join('\n'),
      }
    },
  },

  {
    name: 'Amount',
    trigger: '/amount',
    description: 'Trade amount breakdown',
    category: 'trade',
    icon: 'Coins',
    execute: ({ conversation }) => {
      const t = conversation?.trade
      if (!t) return { kind: 'message', body: 'No trade linked to this conversation.' }
      return {
        kind: 'message',
        body: [
          `Crypto: ${t.crypto_amount} ${t.crypto_token}`,
          `Price:  $${t.crypto_price_per_unit} / ${t.crypto_token}`,
          `Fiat:   ${t.fiat_amount} ${t.fiat_currency}`,
        ].join('\n'),
      }
    },
  },

  {
    name: 'Payment',
    trigger: '/payment',
    description: 'Payment method & details',
    category: 'trade',
    icon: 'CreditCard',
    execute: ({ conversation }) => {
      const t = conversation?.trade
      if (!t) return { kind: 'message', body: 'No trade linked to this conversation.' }
      return {
        kind: 'message',
        body: `Payment method: ${t.payment_method}`,
      }
    },
  },

  // ── Action ──
  {
    name: 'Who',
    trigger: '/who',
    description: 'Partner wallet & role',
    category: 'info',
    icon: 'User',
    execute: ({ conversation, currentUserId }) => {
      const other = conversation?.participants?.find((p) => p.user_id !== currentUserId)
      if (!other) return { kind: 'message', body: 'Partner info unavailable.' }
      const name = other.user.nickname?.trim() || shortAddr(other.user.wallet_address)
      return {
        kind: 'message',
        body: [
          `${name}`,
          `  Wallet: ${shortAddr(other.user.wallet_address)}`,
          `  Role:   ${other.role}`,
        ].join('\n'),
      }
    },
  },

  {
    name: 'Dispute',
    trigger: '/dispute',
    description: 'Open a dispute for this trade',
    category: 'action',
    icon: 'ShieldAlert',
    execute: ({ conversation }) => {
      const t = conversation?.trade
      if (!t) return { kind: 'message', body: 'No trade linked — cannot open a dispute.' }
      return { kind: 'navigate', path: `/app/dispute?trade=${t.id}` }
    },
  },

  {
    name: 'Profile',
    trigger: '/profile',
    description: "View partner's profile",
    category: 'action',
    icon: 'UserCircle',
    execute: ({ conversation, currentUserId }) => {
      const other = conversation?.participants?.find((p) => p.user_id !== currentUserId)
      if (!other) return { kind: 'message', body: 'Partner info unavailable.' }
      return { kind: 'navigate', path: `/app/profile/${other.user.wallet_address}` }
    },
  },
]

// ── Lookup ───────────────────────────────────────────────────────────

export function matchCommand(input: string): ChatCommand | null {
  const trimmed = input.trim().toLowerCase()
  return CHAT_COMMANDS.find((c) => c.trigger === trimmed) ?? null
}

export function filterCommands(query: string): ChatCommand[] {
  const q = query.toLowerCase().replace(/^\//, '')
  return CHAT_COMMANDS.filter(
    (c) => c.trigger.includes(q) || c.name.toLowerCase().includes(q)
  )
}
