import { ChatLayout } from '@/components/custom/chat/ChatLayout'

/**
 * Thin wrapper around the real ChatLayout shell. The route parameter
 * `:conversationId` is read inside ChatLayout via `useParams`.
 */
export function ChatPage() {
  return <ChatLayout />
}
