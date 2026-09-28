import { logUserActivity } from '@/lib/auditLogger'
import type { SysOperator } from '@/types/rbac'

type SupportSenderType = 'user' | 'operator' | 'system'
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
const CHANNEL_NAME = 'coffernode_support_channel'
const TEAM_SENDER_ID = '00000000-0000-0000-0000-000000000000'

export const OUR_TEAM_WELCOME_TEXT =
  "👋 Welcome to CofferNode! You can contact us from here for any issues, questions, or support requests — our operator team will reply directly in this chat. For live community support, you can also join our Discord."

const ago = (min: number) => new Date(Date.now() - 1000 * 60 * min).toISOString()

const seedMsg = (
  id: string,
  thread_id: string,
  user_id: string,
  user_wallet: string,
  sender_type: SupportSenderType,
  sender_id: string,
  sender_name: string,
  body: string,
  minutesAgo: number,
  extra: Partial<SupportMessage> = {},
): SupportMessage => ({
  id,
  thread_id,
  user_id,
  user_wallet,
  sender_type,
  sender_id,
  sender_name,
  body,
  created_at: ago(minutesAgo),
  ...extra,
})

const SEED_THREADS: SupportThread[] = [
  {
    id: 'thread-demo-01',
    user_id: '20000000-0000-0000-0000-000000000001',
    user_wallet: '0x71C...89A1',
    user_nickname: 'CryptoTrader99',
    status: 'OPEN',
    created_at: ago(45),
    updated_at: ago(10),
    last_message: 'Salve, quanto tempo richiede solitamente lo sblocco dell’escrow se la controparte non risponde?',
    last_message_at: ago(10),
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
    created_at: ago(180),
    updated_at: ago(30),
    last_message: 'Perfetto, grazie Elena per aver verificato la transazione.',
    last_message_at: ago(30),
    last_sender_type: 'user',
    unread_for_operator: 0,
    unread_for_user: 0,
    assigned_operator_id: '10000000-0000-0000-0000-000000000003',
    assigned_operator_name: 'Elena Bianchi',
  },
]

const SEED_MESSAGES: SupportMessage[] = [
  seedMsg('msg-demo-1-welcome', 'thread-demo-01', '20000000-0000-0000-0000-000000000001', '0x71C...89A1', 'system', TEAM_SENDER_ID, 'ourTeam', OUR_TEAM_WELCOME_TEXT, 45),
  seedMsg('msg-demo-1-user', 'thread-demo-01', '20000000-0000-0000-0000-000000000001', '0x71C...89A1', 'user', '20000000-0000-0000-0000-000000000001', 'CryptoTrader99', 'Salve, quanto tempo richiede solitamente lo sblocco dell’escrow se la controparte non risponde?', 10),
  seedMsg('msg-demo-2-welcome', 'thread-demo-02', '20000000-0000-0000-0000-000000000002', '0x34B...44D2', 'system', TEAM_SENDER_ID, 'ourTeam', OUR_TEAM_WELCOME_TEXT, 180),
  seedMsg('msg-demo-2-user-1', 'thread-demo-02', '20000000-0000-0000-0000-000000000002', '0x34B...44D2', 'user', '20000000-0000-0000-0000-000000000002', 'Marco_DeFi', 'Buongiorno, ho un dubbio sulla percentuale di fee per i trade USDT.', 120),
  seedMsg('msg-demo-2-op-1', 'thread-demo-02', '20000000-0000-0000-0000-000000000002', '0x34B...44D2', 'operator', '10000000-0000-0000-0000-000000000003', 'ourTeam (Elena Bianchi)', 'Ciao Marco! Le fee del protocollo sono dello 0.5% e vengono calcolate automaticamente dal contratto KlerosEscrow al momento del lock.', 60, { sender_role: 'Support Specialist' }),
  seedMsg('msg-demo-2-user-2', 'thread-demo-02', '20000000-0000-0000-0000-000000000002', '0x34B...44D2', 'user', '20000000-0000-0000-0000-000000000002', 'Marco_DeFi', 'Perfetto, grazie Elena per aver verificato la transazione.', 30),
]

let IN_MEMORY_THREADS: SupportThread[] = [...SEED_THREADS]
let IN_MEMORY_MESSAGES: SupportMessage[] = [...SEED_MESSAGES]
let isHydrated = false

function hydrateFromStorage(): void {
  if (isHydrated) return
  isHydrated = true
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  try {
    const rawT = localStorage.getItem(STORAGE_THREADS_KEY)
    if (rawT) IN_MEMORY_THREADS = JSON.parse(rawT) as SupportThread[]
    else localStorage.setItem(STORAGE_THREADS_KEY, JSON.stringify(IN_MEMORY_THREADS))
    const rawM = localStorage.getItem(STORAGE_MESSAGES_KEY)
    if (rawM) IN_MEMORY_MESSAGES = JSON.parse(rawM) as SupportMessage[]
    else localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(IN_MEMORY_MESSAGES))
  } catch {
    // ignore
  }
}

function getStoredThreads(): SupportThread[] {
  hydrateFromStorage()
  return IN_MEMORY_THREADS
}

function getStoredMessages(): SupportMessage[] {
  hydrateFromStorage()
  return IN_MEMORY_MESSAGES
}

function persist(key: string, value: unknown): void {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore
    }
  }
  notifyUpdate()
}

function notifyUpdate() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage({ type: 'UPDATE', timestamp: Date.now() })
    channel.close()
  } catch {
    // BroadcastChannel optional
  }
}

function setStoredThreads(threads: SupportThread[]): void {
  IN_MEMORY_THREADS = threads
  persist(STORAGE_THREADS_KEY, threads)
}

function setStoredMessages(messages: SupportMessage[]): void {
  IN_MEMORY_MESSAGES = messages
  persist(STORAGE_MESSAGES_KEY, messages)
}

function makeWelcomeMessage(
  user: { id: string; wallet_address?: string | null },
  thread: { id: string; created_at: string },
): SupportMessage {
  return {
    id: `msg-${thread.id}-welcome`,
    thread_id: thread.id,
    user_id: user.id,
    user_wallet: user.wallet_address || '0x...',
    sender_type: 'system',
    sender_id: TEAM_SENDER_ID,
    sender_name: 'ourTeam',
    body: OUR_TEAM_WELCOME_TEXT,
    created_at: thread.created_at || new Date().toISOString(),
  }
}

/** Get (or create) the active user's support thread. */
function getOrCreateUserThread(user: {
  id: string
  wallet_address?: string | null
  nickname?: string | null
}): SupportThread {
  const threads = getStoredThreads()
  const threadId = `thread-user-${user.id}`
  let found = threads.find((t) => t.id === threadId || t.user_id === user.id)

  if (!found) {
    const now = new Date().toISOString()
    const created: SupportThread = {
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
    found = created
    setStoredThreads([created, ...threads])

    const messages = getStoredMessages()
    if (!messages.some((m) => m.thread_id === created.id)) {
      setStoredMessages([...messages, makeWelcomeMessage(user, { id: created.id, created_at: now })])
    }
  }

  return found
}

/** All messages in the ourTeam support thread for the given user. */
export function getOurTeamMessagesForUser(user: {
  id: string
  wallet_address?: string | null
  nickname?: string | null
}): SupportMessage[] {
  const thread = getOrCreateUserThread(user)
  const allMessages = getStoredMessages()
  const threadMessages = allMessages.filter((m) => m.thread_id === thread.id || m.user_id === user.id)

  if (threadMessages.length === 0) {
    const welcomeMsg = makeWelcomeMessage(user, thread)
    setStoredMessages([...allMessages, welcomeMsg])
    return [welcomeMsg]
  }

  return threadMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

/** User sends a message to ourTeam support. */
export async function sendUserOurTeamMessage(
  user: { id: string; wallet_address?: string | null; nickname?: string | null; avatar_url?: string | null },
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
  setStoredMessages([...getStoredMessages(), newMessage])

  setStoredThreads(
    getStoredThreads().map((t) =>
      t.id === thread.id
        ? {
            ...t,
            status: t.status === 'RESOLVED' ? ('OPEN' as const) : t.status,
            last_message: cleanBody,
            last_message_at: now,
            last_sender_type: 'user' as const,
            updated_at: now,
            unread_for_operator: (t.unread_for_operator || 0) + 1,
          }
        : t
    )
  )

  return newMessage
}

/** Operator replies to a user's support thread. */
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
  const newMessage: SupportMessage = {
    id: `msg-op-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    thread_id: thread.id,
    user_id: thread.user_id,
    user_wallet: thread.user_wallet,
    sender_type: 'operator',
    sender_id: operator.id,
    sender_name: operator.full_name ? `ourTeam (${operator.full_name})` : `ourTeam (${operator.username})`,
    sender_role: (operator.roles ?? [])[0] || 'Support Operator',
    body: cleanBody,
    created_at: now,
  }
  setStoredMessages([...getStoredMessages(), newMessage])

  setStoredThreads(
    threads.map((t) =>
      t.id === thread.id
        ? {
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
        : t
    )
  )

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

/** All support threads, newest activity first (operator portal). */
export function listSupportThreads(): SupportThread[] {
  return [...getStoredThreads()].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  )
}

/** Messages for one thread, oldest first. */
export function getThreadMessages(threadId: string): SupportMessage[] {
  return getStoredMessages()
    .filter((m) => m.thread_id === threadId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

export async function updateSupportThreadStatus(
  threadId: string,
  status: SupportThreadStatus,
  operator?: SysOperator
): Promise<void> {
  setStoredThreads(
    getStoredThreads().map((t) =>
      t.id === threadId
        ? {
            ...t,
            status,
            updated_at: new Date().toISOString(),
            assigned_operator_id: operator?.id || t.assigned_operator_id,
            assigned_operator_name: operator?.full_name || operator?.username || t.assigned_operator_name,
          }
        : t
    )
  )

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
        metadata: { new_status: status, operator_username: operator.username },
      })
    } catch (err) {
      console.warn('[supportChatService] audit log failed:', err)
    }
  }
}

export function markThreadReadByUser(userId: string): void {
  const threadId = `thread-user-${userId}`
  let changed = false
  const updated = getStoredThreads().map((t) => {
    if ((t.id === threadId || t.user_id === userId) && t.unread_for_user > 0) {
      changed = true
      return { ...t, unread_for_user: 0 }
    }
    return t
  })
  if (changed) setStoredThreads(updated)
}

export function markThreadReadByOperator(threadId: string): void {
  let changed = false
  const updated = getStoredThreads().map((t) => {
    if (t.id === threadId && t.unread_for_operator > 0) {
      changed = true
      return { ...t, unread_for_operator: 0 }
    }
    return t
  })
  if (changed) setStoredThreads(updated)
}

/** Latest preview + unread count for the ourTeam sidebar item. */
export function getOurTeamThreadPreview(userId: string): {
  last_message_preview: string
  last_message_at: string
  unread_count: number
} {
  const thread = getStoredThreads().find((t) => t.id === `thread-user-${userId}` || t.user_id === userId)
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

/** Subscribe to support chat changes across tabs or inside the same tab. */
export function subscribeSupportChat(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  const handler = () => callback()
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_THREADS_KEY || e.key === STORAGE_MESSAGES_KEY) callback()
  }
  window.addEventListener(EVENT_NAME, handler)
  window.addEventListener('storage', storageHandler)

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = () => callback()
  } catch {
    // ignore
  }

  return () => {
    window.removeEventListener(EVENT_NAME, handler)
    window.removeEventListener('storage', storageHandler)
    if (channel) channel.close()
  }
}
