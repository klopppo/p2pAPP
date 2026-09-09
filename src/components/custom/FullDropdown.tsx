import { useState } from 'react'
import { ChevronDown, Check, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface DropdownOption {
  label: string
  value: string
  icon?: LucideIcon
}

interface FullDropdownProps {
  /** Prefix label, e.g. "Type", "Token", "Payment" */
  label: string
  /** Currently selected value */
  value: string
  options: DropdownOption[]
  onSelect: (value: string) => void
  /** Optional icon on the trigger */
  icon?: LucideIcon
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  /** Render the resolved option label instead of the raw value */
  showOptionLabel?: boolean
}

export function FullDropdown({
  label,
  value,
  options,
  onSelect,
  icon: TriggerIcon,
  align = 'start',
  sideOffset = 8,
  showOptionLabel = true,
}: FullDropdownProps) {
  const [open, setOpen] = useState(false)

  const displayValue =
    showOptionLabel && value !== 'all'
      ? options.find((o) => o.value === value)?.label ?? value
      : value === 'all'
        ? 'All'
        : value

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-4 h-9 rounded-full border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer shadow-none"
        >
          {TriggerIcon && <TriggerIcon className="w-4 h-4" />}
          {label}: <span className="text-foreground">{displayValue}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} sideOffset={sideOffset} className="min-w-56 w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuGroup>
          {options.map((o) => {
            const isActive = o.value === value
            const Icon = o.icon
            return (
              <DropdownMenuItem
                key={o.value}
                onSelect={() => onSelect(o.value)}
                className="capitalize cursor-pointer whitespace-normal py-2.5"
              >
                {Icon && <Icon className="w-4 h-4" />}
                <span className="flex-1">{o.label}</span>
                {isActive && <Check className="w-4 h-4 ml-2 shrink-0" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
