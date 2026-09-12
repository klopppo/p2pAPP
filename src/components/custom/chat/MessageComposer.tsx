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
    <div className="pt-4 border-t border-border/40 shrink-0">
      <div className="flex items-center gap-2">
        <Input
          placeholder={placeholder ?? t('chat.typeMessage')}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
          enterKeyHint="send"
          autoComplete="off"
          className="flex-1 h-10 rounded-full border-border bg-muted/40 placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:ring-primary/20"
        />
        <Button
          onClick={() => {
            onSend()
            onStopTyping()
          }}
          disabled={disabled || !value.trim()}
          size="icon-lg"
          aria-label={t('chat.send')}
          className="rounded-full shrink-0 shadow-none transition-transform active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
