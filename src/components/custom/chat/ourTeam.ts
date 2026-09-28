/**
 * Synthetic "ourTeam" support contact pinned atop the chat sidebar. There is no
 * DB row; `ChatLayout` renders an inline welcome thread with the composer disabled.
 */
import type { ConversationView } from '@/types/database'
import { getOurTeamThreadPreview } from '@/lib/supportChatService'

export const OUR_TEAM_ID = 'ourTeam'
export const OUR_TEAM_DISCORD = 'https://discord.gg/coffernode'

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
