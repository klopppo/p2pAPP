/**
 * Synthetic "ourTeam" virtual contact rendered at the top of the chat
 * sidebar. There is no DB row for it; the welcome message is bundled with
 * the client and a "Get support" link points to the platform Discord.
 *
 * Layout treats it as a regular conversation so the renderer doesn't need
 * a special branch — the synthetic shape mimics `ConversationView` with
 * the current user pinned as the only participant and a single system
 * message in `last_message_preview`. When the user opens it, ChatLayout
 * intercepts the special id and renders an inline welcome thread with the
 * composer disabled (no DB row to send to).
 *
 * Stable id `'ourTeam'` is used so URL `?tradeId=…` query params can't
 * accidentally collide. Migration safety: future refactors can rename
 * by updating `OUR_TEAM_ID` + the `ChatLayout` switch — the value isn't
 * referenced anywhere outside this module.
 */
import type { ConversationView } from '@/types/database'

export const OUR_TEAM_ID = 'ourTeam'
export const OUR_TEAM_DISCORD = 'https://discord.gg/coffernode'

const WELCOME_BODY =
  "👋 Welcome to CofferNode! You can contact us from here for any " +
  "issues, questions, or support requests — replies usually land within a " +
  "few hours during business days. We're here to help, and for live " +
  "community support see Discord below."

/** Build a synthetic `ConversationView` for the current user. The current
 *  user is the only participant; partners are an empty array so the
 *  ConversationItem / ChatHeader "other party" resolver falls back to a
 *  system contact identity. */
export function createOurTeamConversation(
  currentUser: { id: string; wallet_address?: string | null; nickname?: string | null; avatar_url?: string | null },
): ConversationView {
  return {
    id: OUR_TEAM_ID,
    trade_id: null,
    status: 'open',
    last_message_at: new Date().toISOString(),
    last_message_preview: WELCOME_BODY.slice(0, 200),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    unread_count: 0,
    last_read_message_id: null,
    participants: [
      {
        conversation_id: OUR_TEAM_ID,
        user_id: currentUser.id,
        role: 'buyer',
        last_read_message_id: null,
        muted: false,
        joined_at: new Date().toISOString(),
        user: {
          id: currentUser.id,
          wallet_address: currentUser.wallet_address ?? '',
          nickname: currentUser.nickname ?? null,
          avatar_url: currentUser.avatar_url ?? null,
          verification_level: 'unverified',
          last_active_at: null,
        },
      },
    ],
    trade: null,
  }
}

/** The synthetic welcome message rendered when the user opens ourTeam. */
export const OUR_TEAM_WELCOME = WELCOME_BODY
