import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface DateRange {
  from: Date | null
  to: Date | null
}

interface Props {
  /** Prefix label, e.g. "Date". */
  label: string
  value: DateRange
  onChange: (range: DateRange) => void
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/**
 * Pill trigger + popover with quick presets and a single-month range calendar
 * (date-fns only — no extra dependency). Matches the `FullDropdown` trigger
 * styling so it sits naturally beside the role/status filters.
 */
export function DateRangeFilter({ label, value, onChange }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState<Date>(() => value.from ?? new Date())

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  })

  const handleDay = (day: Date) => {
    const d = startOfDay(day)
    if (!value.from || (value.from && value.to)) {
      onChange({ from: d, to: null })
    } else if (d < value.from) {
      onChange({ from: d, to: value.from })
    } else {
      onChange({ from: value.from, to: d })
    }
  }

  const isInRange = (day: Date) =>
    !!value.from &&
    !!value.to &&
    day >= startOfDay(value.from) &&
    day <= startOfDay(value.to)

  const display = value.from
    ? value.to && !isSameDay(value.from, value.to)
      ? `${format(value.from, 'MMM d')} – ${format(value.to, 'MMM d')}`
      : format(value.from, 'MMM d, yyyy')
    : t('trades.dateAll')

  const presets: { key: string; label: string; run: () => void }[] = [
    {
      key: 'all',
      label: t('trades.dateAll'),
      run: () => onChange({ from: null, to: null }),
    },
    {
      key: 'today',
      label: t('trades.dateToday'),
      run: () => {
        const now = new Date()
        onChange({ from: startOfDay(now), to: now })
      },
    },
    {
      key: '7d',
      label: t('trades.dateLast7'),
      run: () => {
        const to = new Date()
        const from = new Date()
        from.setDate(from.getDate() - 6)
        onChange({ from: startOfDay(from), to })
      },
    },
    {
      key: '30d',
      label: t('trades.dateLast30'),
      run: () => {
        const to = new Date()
        const from = new Date()
        from.setDate(from.getDate() - 29)
        onChange({ from: startOfDay(from), to })
      },
    },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-4 h-9 rounded-full border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer shadow-none">
          <CalendarIcon className="w-4 h-4" />
          {label}: <span className="text-foreground">{display}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-auto p-3 rounded-2xl">
        <div className="flex gap-3">
          <div className="flex flex-col gap-0.5 pr-3 border-r border-border/50">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  p.run()
                  setOpen(false)
                }}
                className="text-left text-sm px-2.5 py-1.5 rounded-lg hover:bg-accent text-foreground transition-colors cursor-pointer whitespace-nowrap"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <button
                type="button"
                aria-label={t('trades.datePrevMonth')}
                onClick={() => setMonth(subMonths(month, 1))}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-foreground">
                {format(month, 'MMMM yyyy')}
              </span>
              <button
                type="button"
                aria-label={t('trades.dateNextMonth')}
                onClick={() => setMonth(addMonths(month, 1))}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((d) => (
                <span
                  key={d}
                  className="w-8 h-8 flex items-center justify-center text-[10px] font-semibold uppercase text-muted-foreground"
                >
                  {d}
                </span>
              ))}
              {days.map((day) => {
                const selected =
                  (!!value.from && isSameDay(day, value.from)) ||
                  (!!value.to && isSameDay(day, value.to))
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => handleDay(day)}
                    className={cn(
                      'w-8 h-8 rounded-full text-xs transition-colors cursor-pointer',
                      !isSameMonth(day, month) && 'text-muted-foreground/40',
                      selected
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : isInRange(day)
                          ? 'bg-primary/15 text-foreground'
                          : 'hover:bg-accent text-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
