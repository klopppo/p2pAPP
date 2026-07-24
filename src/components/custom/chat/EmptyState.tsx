import { MessageCircle } from 'lucide-react'

/**
 * Big empty state shown in the right pane when no conversation is selected
 * (or when the user has zero conversations at all).
 */
export function EmptyState({ noConversations }: { noConversations?: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center">
          <MessageCircle className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold">
          {noConversations ? 'No conversations yet' : 'Select a conversation'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {noConversations
            ? 'Open an offer to start a chat with the trader. Every trade gets its own conversation so messages stay tied to the right escrow.'
            : 'Pick a conversation from the left to view its messages and trade context.'}
        </p>
      </div>
    </div>
  )
}
