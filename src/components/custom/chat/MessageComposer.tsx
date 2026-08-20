import type { KeyboardEvent } from 'react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onTyping: () => void
  onStopTyping: () => void
  disabled?: boolean
  placeholder?: string
}

/**
 * Bottom composer. Single-row pill input + circular send button. Enter sends,
 * Shift+Enter inserts a newline (future textarea mode). Emits typing events
 * upstream so the other party can see the indicator.
 */
export function MessageComposer({
  value,
  onChange,
  onSend,
  onTyping,
  onStopTyping,
  disabled,
  placeholder,
}: Props) {
  const { t } = useTranslation()
  const lastTypingRef = useRef(0)

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
      onStopTyping()
    }
  }

  const handleChange = (v: string) => {
    onChange(v)
    const now = Date.now()
    if (now - lastTypingRef.current > 1200) {
      lastTypingRef.current = now
      onTyping()
    }
    if (v.length === 0) onStopTyping()
  }

  return (
    <div className="pt-4 border-t border-border/50 shrink-0">
      <div className="flex gap-2">
        <Input
          placeholder={placeholder ?? t('chat.typeMessage')}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
          className="rounded-full"
        />
        <Button
          onClick={() => {
            onSend()
            onStopTyping()
          }}
          disabled={disabled || !value.trim()}
          size="icon"
          className="rounded-full"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
