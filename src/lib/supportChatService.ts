import { logUserActivity } from '@/lib/auditLogger'
import type { SysOperator } from '@/types/rbac'

export type SupportSenderType = 'user' | 'operator' | 'system'
export type SupportThreadStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'

export interface SupportMessage {
  id: string
  thread_id: string
  user_id: string
  user_wallet: string
  sender_type: SupportSenderType
  sender_id: string
  sender_name: string
  sender_role?: string
  sender_avatar?: string | null
  body: string
  created_at: string
}

export interface SupportThread {
  id: string
  user_id: string
  user_wallet: string
  user_nickname?: string | null
  status: SupportThreadStatus
  created_at: string
  updated_at: string
  last_message: string
  last_message_at: string
  last_sender_type: SupportSenderType
  unread_for_operator: number
  unread_for_user: number
  assigned_operator_id?: string | null
  assigned_operator_name?: string | null
}

const STORAGE_THREADS_KEY = 'coffernode_support_threads_v1'
const STORAGE_MESSAGES_KEY = 'coffernode_support_messages_v1'
const EVENT_NAME = 'coffernode_support_chat_update'

export const OUR_TEAM_WELCOME_TEXT =
  "👋 Welcome to CofferNode! You can contact us from here for any " +
  "issues, questions, or support requests — our operator team will reply " +
  "directly in this chat. For live community support, you can also join our Discord."

const SEED_THREADS: SupportThread[] = [
  {
    id: 'thread-demo-01',
    user_id: '20000000-0000-0000-0000-000000000001',
    user_wallet: '0x71C...89A1',
    user_nickname: 'CryptoTrader99',
    status: 'OPEN',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    last_message: 'Salve, quanto tempo richiede solitamente lo sblocco dell’escrow se la controparte non risponde?',
    last_message_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    last_sender_type: 'user',
    unread_for_operator: 1,
    unread_for_user: 0,
  },
  {
    id: 'thread-demo-02',
    user_id: '20000000-0000-0000-0000-000000000002',
    user_wallet: '0x34B...44D2',
    user_nickname: 'Marco_DeFi',
    status: 'IN_PROGRESS',
    created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    last_message: 'Perfetto, grazie Elena per aver verificato la transazione.',
    last_message_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    last_sender_type: 'user',
    unread_for_operator: 0,
    unread_for_user: 0,
    assigned_operator_id: '10000000-0000-0000-0000-000000000003',
    assigned_operator_name: 'Elena Bianchi',
  },
]

const SEED_MESSAGES: SupportMessage[] = [
  {
    id: 'msg-demo-1-welcome',
    thread_id: 'thread-demo-01',
    user_id: '20000000-0000-0000-0000-000000000001',
    user_wallet: '0x71C...89A1',
    sender_type: 'system',
    sender_id: '00000000-0000-0000-0000-000000000000',
    sender_name: 'ourTeam',
    body: OUR_TEAM_WELCOME_TEXT,
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'msg-demo-1-user',
    thread_id: 'thread-demo-01',
    user_id: '20000000-0000-0000-0000-000000000001',
    user_wallet: '0x71C...89A1',
    sender_type: 'user',
    sender_id: '20000000-0000-0000-0000-000000000001',
    sender_name: 'CryptoTrader99',
    body: 'Salve, quanto tempo richiede solitamente lo sblocco dell’escrow se la controparte non risponde?',
    created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  {
    id: 'msg-demo-2-welcome',
    thread_id: 'thread-demo-02',
    user_id: '20000000-0000-0000-0000-000000000002',
    user_wallet: '0x34B...44D2',
    sender_type: 'system',
    sender_id: '00000000-0000-0000-0000-000000000000',
    sender_name: 'ourTeam',
    body: OUR_TEAM_WELCOME_TEXT,
    created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
  {
    id: 'msg-demo-2-user-1',
    thread_id: 'thread-demo-02',
    user_id: '20000000-0000-0000-0000-000000000002',
    user_wallet: '0x34B...44D2',
    sender_type: 'user',
    sender_id: '20000000-0000-0000-0000-000000000002',
    sender_name: 'Marco_DeFi',
    body: 'Buongiorno, ho un dubbio sulla percentuale di fee per i trade USDT.',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: 'msg-demo-2-op-1',
    thread_id: 'thread-demo-02',
    user_id: '20000000-0000-0000-0000-000000000002',
    user_wallet: '0x34B...44D2',
    sender_type: 'operator',
    sender_id: '10000000-0000-0000-0000-000000000003',
    sender_name: 'ourTeam (Elena Bianchi)',
    sender_role: 'Support Specialist',
    body: 'Ciao Marco! Le fee del protocollo sono dello 0.5% e vengono calcolate automaticamente dal contratto KlerosEscrow al momento del lock.',
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: 'msg-demo-2-user-2',
    thread_id: 'thread-demo-02',
    user_id: '20000000-0000-0000-0000-000000000002',
    user_wallet: '0x34B...44D2',
    sender_type: 'user',
    sender_id: '20000000-0000-0000-0000-000000000002',
    sender_name: 'Marco_DeFi',
    body: 'Perfetto, grazie Elena per aver verificato la transazione.',
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
]

let IN_MEMORY_THREADS: SupportThread[] = [...SEED_THREADS]
let IN_MEMORY_MESSAGES: SupportMessage[] = [...SEED_MESSAGES]
let isHydrated = false

function hydrateFromStorage(): void {
  if (isHydrated) return
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    isHydrated = true
    return
  }
  try {
    const rawT = localStorage.getItem(STORAGE_THREADS_KEY)
    if (rawT) {
      IN_MEMORY_THREADS = JSON.parse(rawT) as SupportThread[]
    } else {
      localStorage.setItem(STORAGE_THREADS_KEY, JSON.stringify(IN_MEMORY_THREADS))
    }
    const rawM = localStorage.getItem(STORAGE_MESSAGES_KEY)
    if (rawM) {
      IN_MEMORY_MESSAGES = JSON.parse(rawM) as SupportMessage[]
    } else {
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(IN_MEMORY_MESSAGES))
    }
  } catch {
    // ignore
  }
  isHydrated = true
}

function getStoredThreads(): SupportThread[] {
  hydrateFromStorage()
  return IN_MEMORY_THREADS
}

function setStoredThreads(threads: SupportThread[]): void {
  IN_MEMORY_THREADS = threads
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_THREADS_KEY, JSON.stringify(threads))
    } catch {
      // ignore
    }
  }
  notifyUpdate()
}

function getStoredMessages(): SupportMessage[] {
  hydrateFromStorage()
  return IN_MEMORY_MESSAGES
}

function setStoredMessages(messages: SupportMessage[]): void {
  IN_MEMORY_MESSAGES = messages
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages))
    } catch {
      // ignore
    }
  }
  notifyUpdate()
}

function notifyUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME))
    try {
      const channel = new BroadcastChannel('coffernode_support_channel')
      channel.postMessage({ type: 'UPDATE', timestamp: Date.now() })
      channel.close()
    } catch {
      // BroadcastChannel optional
    }
  }
}

/**
 * Normalise thread id for a given user.
 */
export function getUserThreadId(userId: string): string {
  return `thread-user-${userId}`
}

/**
 * Get or create the support thread for the active user.
 */
export function getOrCreateUserThread(user: {
  id: string
  wallet_address?: string | null
  nickname?: string | null
}): SupportThread {
  const threads = getStoredThreads()
  const threadId = getUserThreadId(user.id)
  let found = threads.find((t) => t.id === threadId || t.user_id === user.id)

  if (!found) {
    const now = new Date().toISOString()
    found = {
      id: threadId,
      user_id: user.id,
      user_wallet: user.wallet_address || '0x...',
      user_nickname: user.nickname || 'User',
      status: 'OPEN',
      created_at: now,
      updated_at: now,
      last_message: OUR_TEAM_WELCOME_TEXT,
      last_message_at: now,
      last_sender_type: 'system',
      unread_for_operator: 0,
      unread_for_user: 0,
    }
    const nextThreads = [found, ...threads]
    setStoredThreads(nextThreads)

    // Also seed the initial welcome message for this thread if absent
    const messages = getStoredMessages()
    if (!messages.some((m) => m.thread_id === found!.id)) {
      const welcomeMsg: SupportMessage = {
        id: `msg-${found.id}-welcome`,
        thread_id: found.id,
        user_id: user.id,
        user_wallet: user.wallet_address || '0x...',
        sender_type: 'system',
        sender_id: '00000000-0000-0000-0000-000000000000',
        sender_name: 'ourTeam',
        body: OUR_TEAM_WELCOME_TEXT,
        created_at: now,
      }
      setStoredMessages([...messages, welcomeMsg])
    }
  }

  return found
}

/**
 * Returns all messages in the ourTeam support thread for the given user.
 */
export function getOurTeamMessagesForUser(user: {
  id: string
  wallet_address?: string | null
  nickname?: string | null
}): SupportMessage[] {
  const thread = getOrCreateUserThread(user)
  const allMessages = getStoredMessages()
  const threadMessages = allMessages.filter(
    (m) => m.thread_id === thread.id || m.user_id === user.id
  )

  // Ensure at least welcome message exists
  if (threadMessages.length === 0) {
    const welcomeMsg: SupportMessage = {
      id: `msg-${thread.id}-welcome`,
      thread_id: thread.id,
      user_id: user.id,
      user_wallet: user.wallet_address || '0x...',
      sender_type: 'system',
      sender_id: '00000000-0000-0000-0000-000000000000',
      sender_name: 'ourTeam',
      body: OUR_TEAM_WELCOME_TEXT,
      created_at: thread.created_at || new Date().toISOString(),
    }
    setStoredMessages([...allMessages, welcomeMsg])
    return [welcomeMsg]
  }

  return threadMessages.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

/**
 * User sends a message to ourTeam support.
 */
export async function sendUserOurTeamMessage(
  user: {
    id: string
    wallet_address?: string | null
    nickname?: string | null
    avatar_url?: string | null
  },
  body: string
): Promise<SupportMessage> {
  const cleanBody = body.trim()
  if (!cleanBody) throw new Error('Message body is empty')

  const thread = getOrCreateUserThread(user)
  const now = new Date().toISOString()
  const newMessage: SupportMessage = {
    id: `msg-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    thread_id: thread.id,
    user_id: user.id,
    user_wallet: user.wallet_address || '0x...',
    sender_type: 'user',
    sender_id: user.id,
    sender_name: user.nickname || 'You',
    sender_avatar: user.avatar_url ?? null,
    body: cleanBody,
    created_at: now,
  }

  // Update messages
  const messages = getStoredMessages()
  setStoredMessages([...messages, newMessage])

  // Update thread
  const threads = getStoredThreads()
  const updatedThreads = threads.map((t) => {
    if (t.id === thread.id) {
      return {
        ...t,
        status: t.status === 'RESOLVED' ? ('OPEN' as const) : t.status,
        last_message: cleanBody,
        last_message_at: now,
        last_sender_type: 'user' as const,
        updated_at: now,
        unread_for_operator: (t.unread_for_operator || 0) + 1,
      }
    }
    return t
  })
  setStoredThreads(updatedThreads)

  return newMessage
}

/**
 * Operator sends a reply to a user's support thread.
 */
export async function sendOperatorOurTeamReply(
  threadId: string,
  operator: SysOperator,
  body: string
): Promise<SupportMessage> {
  const cleanBody = body.trim()
  if (!cleanBody) throw new Error('Message body is empty')

  const threads = getStoredThreads()
  const thread = threads.find((t) => t.id === threadId)
  if (!thread) throw new Error(`Support thread ${threadId} not found`)

  const now = new Date().toISOString()
  const senderName = operator.full_name
    ? `ourTeam (${operator.full_name})`
    : `ourTeam (${operator.username})`

  const newMessage: SupportMessage = {
    id: `msg-op-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    thread_id: thread.id,
    user_id: thread.user_id,
    user_wallet: thread.user_wallet,
    sender_type: 'operator',
    sender_id: operator.id,
    sender_name: senderName,
    sender_role: (operator.roles ?? [])[0] || 'Support Operator',
    body: cleanBody,
    created_at: now,
  }

  // Save message
  const messages = getStoredMessages()
  setStoredMessages([...messages, newMessage])

  // Update thread
  const updatedThreads = threads.map((t) => {
    if (t.id === thread.id) {
      return {
        ...t,
        status: 'IN_PROGRESS' as const,
        last_message: cleanBody,
        last_message_at: now,
        last_sender_type: 'operator' as const,
        updated_at: now,
        unread_for_user: (t.unread_for_user || 0) + 1,
        assigned_operator_id: operator.id,
        assigned_operator_name: operator.full_name || operator.username,
      }
    }
    return t
  })
  setStoredThreads(updatedThreads)

  // Audit log operator response
  try {
    await logUserActivity({
      operator_id: operator.id,
      wallet_address: operator.wallet_address || operator.email,
      program_id: 'OPERATOR_PORTAL',
      action: 'SUPPORT_CHAT_REPLY',
      resource_type: 'support_thread',
      resource_id: thread.id,
      status: 'SUCCESS',
      metadata: {
        operator_username: operator.username,
        user_wallet: thread.user_wallet,
        user_id: thread.user_id,
        message_preview: cleanBody.slice(0, 120),
      },
    })
  } catch (err) {
    console.warn('[supportChatService] audit log failed:', err)
  }

  return newMessage
}

/**
 * List all support threads for the operator portal.
 */
export function listSupportThreads(): SupportThread[] {
  const threads = getStoredThreads()
  return [...threads].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  )
}

/**
 * Get messages for a specific thread.
 */
export function getThreadMessages(threadId: string): SupportMessage[] {
  const messages = getStoredMessages()
  return messages
    .filter((m) => m.thread_id === threadId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

/**
 * Update support thread status.
 */
export async function updateSupportThreadStatus(
  threadId: string,
  status: SupportThreadStatus,
  operator?: SysOperator
): Promise<void> {
  const threads = getStoredThreads()
  const updated = threads.map((t) => {
    if (t.id === threadId) {
      return {
        ...t,
        status,
        updated_at: new Date().toISOString(),
        assigned_operator_id: operator?.id || t.assigned_operator_id,
        assigned_operator_name: operator?.full_name || operator?.username || t.assigned_operator_name,
      }
    }
    return t
  })
  setStoredThreads(updated)

  if (operator) {
    try {
      await logUserActivity({
        operator_id: operator.id,
        wallet_address: operator.wallet_address || operator.email,
        program_id: 'OPERATOR_PORTAL',
        action: 'UPDATE_SUPPORT_THREAD_STATUS',
        resource_type: 'support_thread',
        resource_id: threadId,
        status: 'SUCCESS',
        metadata: {
          new_status: status,
          operator_username: operator.username,
        },
      })
    } catch (err) {
      console.warn('[supportChatService] audit log failed:', err)
    }
  }
}

/**
 * Mark thread as read by user.
 */
export function markThreadReadByUser(userId: string): void {
  const threads = getStoredThreads()
  const threadId = getUserThreadId(userId)
  let changed = false
  const updated = threads.map((t) => {
    if ((t.id === threadId || t.user_id === userId) && t.unread_for_user > 0) {
      changed = true
      return { ...t, unread_for_user: 0 }
    }
    return t
  })
  if (changed) setStoredThreads(updated)
}

/**
 * Mark thread as read by operator.
 */
export function markThreadReadByOperator(threadId: string): void {
  const threads = getStoredThreads()
  let changed = false
  const updated = threads.map((t) => {
    if (t.id === threadId && t.unread_for_operator > 0) {
      changed = true
      return { ...t, unread_for_operator: 0 }
    }
    return t
  })
  if (changed) setStoredThreads(updated)
}

/**
 * Returns latest preview and unread count for the ourTeam conversation item in sidebar.
 */
export function getOurTeamThreadPreview(userId: string): {
  last_message_preview: string
  last_message_at: string
  unread_count: number
} {
  const threads = getStoredThreads()
  const threadId = getUserThreadId(userId)
  const thread = threads.find((t) => t.id === threadId || t.user_id === userId)

  if (thread) {
    return {
      last_message_preview: thread.last_message,
      last_message_at: thread.last_message_at,
      unread_count: thread.unread_for_user || 0,
    }
  }

  return {
    last_message_preview: OUR_TEAM_WELCOME_TEXT.slice(0, 200),
    last_message_at: new Date().toISOString(),
    unread_count: 0,
  }
}

/**
 * Subscribe to support chat changes across tabs or inside the same tab.
 */
export function subscribeSupportChat(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  const handler = () => callback()
  window.addEventListener(EVENT_NAME, handler)
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_THREADS_KEY || e.key === STORAGE_MESSAGES_KEY) {
      callback()
    }
  })

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel('coffernode_support_channel')
    channel.onmessage = () => callback()
  } catch {
    // ignore
  }

  return () => {
    window.removeEventListener(EVENT_NAME, handler)
    if (channel) channel.close()
  }
}
