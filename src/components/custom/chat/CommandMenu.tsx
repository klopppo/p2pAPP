import { useEffect, useRef, useState } from 'react'
import {
  CircleHelp,
  Receipt,
  Activity,
  Coins,
  CreditCard,
  User,
  ShieldAlert,
  UserCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { filterCommands, type ChatCommand } from '@/lib/chat/commands'

const ICONS: Record<string, LucideIcon> = {
  CircleHelp,
  Receipt,
  Activity,
  Coins,
  CreditCard,
  User,
  ShieldAlert,
  UserCircle,
}

interface Props {
  query: string
  onSelect: (command: ChatCommand) => void
  onClose: () => void
  visible: boolean
}

/**
 * Floating command palette above the composer. Appears when the user types
 * "/" and filters as they type. Keyboard: ↑↓ navigate, Enter selects,
 * Escape closes.
 */
export function CommandMenu({ query, onSelect, onClose, visible }: Props) {
  const commands = filterCommands(query)
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset index when query changes
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!visible || commands.length === 0) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % commands.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + commands.length) % commands.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onSelect(commands[activeIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 z-50"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-popover/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl overflow-hidden max-h-[280px] overflow-y-auto">
        <div className="px-3 py-2 border-b border-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Commands
          </p>
        </div>
        <div ref={listRef} className="p-1">
          {commands.map((cmd, i) => {
            const Icon = ICONS[cmd.icon] ?? CircleHelp
            return (
              <button
                key={cmd.trigger}
                type="button"
                onClick={() => onSelect(cmd)}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer',
                  i === activeIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-muted/50'
                )}
              >
                <div className="h-8 w-8 shrink-0 rounded-lg bg-muted/80 flex items-center justify-center text-muted-foreground">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{cmd.trigger}</span>
                    <span className="text-xs text-muted-foreground">{cmd.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
