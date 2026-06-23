import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, Check } from 'lucide-react'

interface FilterDropdownProps {
  label: string
  selectedValue: string
  options: { value: string; label: string; icon?: ReactNode }[]
  onValueChange: (value: string) => void
}

export function FilterDropdown({ label, selectedValue, options, onValueChange }: FilterDropdownProps) {
  const selectedOption = options.find(opt => opt.value === selectedValue)

  return (
    <div className="flex flex-col gap-1.5 min-w-[160px]">
      <span className="text-[12px] font-bold text-primary uppercase tracking-wider px-1">
        {label}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between bg-surface-container-low border-border hover:border-primary transition-colors px-4 py-2.5 rounded-xl"
          >
            <div className="flex items-center gap-2">
              {selectedOption?.icon}
              <span>{selectedOption?.label}</span>
            </div>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-card border-border shadow-lg rounded-2xl w-56">
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onValueChange(option.value)}
              className="gap-2 cursor-pointer"
            >
              {selectedValue === option.value && (
                <Check className="w-4 h-4 text-primary" />
              )}
              {option.icon}
              <span>{option.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
