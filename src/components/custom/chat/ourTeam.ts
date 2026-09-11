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
import { getOurTeamThreadPreview, OUR_TEAM_WELCOME_TEXT } from '@/lib/supportChatService'

export const OUR_TEAM_ID = 'ourTeam'
export const OUR_TEAM_DISCORD = 'https://discord.gg/coffernode'

export const OUR_TEAM_WELCOME = OUR_TEAM_WELCOME_TEXT

/** Build a synthetic `ConversationView` for the current user. */
export function createOurTeamConversation(
  currentUser: { id: string; wallet_address?: string | null; nickname?: string | null; avatar_url?: string | null },
): ConversationView {
  const preview = getOurTeamThreadPreview(currentUser.id)

  return {
    id: OUR_TEAM_ID,
    trade_id: null,
    status: 'open',
    last_message_at: preview.last_message_at,
    last_message_preview: preview.last_message_preview.slice(0, 200),
    created_at: new Date().toISOString(),
    updated_at: preview.last_message_at,
    unread_count: preview.unread_count,
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
