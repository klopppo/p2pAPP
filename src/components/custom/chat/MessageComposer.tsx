import type { KeyboardEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CommandMenu } from './CommandMenu'
import type { ChatCommand } from '@/lib/chat/commands'

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onCommand: (command: ChatCommand) => void
  onTyping: () => void
  onStopTyping: () => void
  disabled?: boolean
  placeholder?: string
  maxLength?: number
}

/**
 * Bottom composer. Single-row pill input + circular send button. Enter sends,
 * Shift+Enter inserts a newline (future textarea mode). Typing "/" opens a
 * command palette that filters as you type.
 */
export function MessageComposer({
  value,
  onChange,
  onSend,
  onCommand,
  onTyping,
  onStopTyping,
  disabled,
  placeholder = 'Type a message…',
  maxLength = 4000,
}: Props) {
  const lastTypingRef = useRef(0)
  const [commandMode, setCommandMode] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')

  // Detect "/" at the start of input to enter command mode
  useEffect(() => {
    if (value.startsWith('/')) {
      setCommandMode(true)
      setCommandQuery(value)
    } else {
      setCommandMode(false)
      setCommandQuery('')
    }
  }, [value])

  const handleCommandSelect = useCallback(
    (cmd: ChatCommand) => {
      setCommandMode(false)
      setCommandQuery('')
      onCommand(cmd)
    },
    [onCommand]
  )

  const closeCommandMenu = useCallback(() => {
    setCommandMode(false)
    setCommandQuery('')
  }, [])

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Let CommandMenu handle nav keys when visible
    if (commandMode && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (commandMode && commandQuery.trim()) {
        // If in command mode with text, let the menu handle Enter
        return
      }
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
    <div className="relative pt-4 border-t border-border/50 shrink-0">
      <CommandMenu
        query={commandQuery}
        visible={commandMode}
        onSelect={handleCommandSelect}
        onClose={closeCommandMenu}
      />
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
          maxLength={maxLength}
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
