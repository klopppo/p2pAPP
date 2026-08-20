import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, MessageCircle, ShieldAlert, Tag, Loader2, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useNotifications,
  useUnreadCount,
  useMarkAllRead,
  useMarkNotificationRead,
} from '@/hooks/useNotifications'
import type { Notification, NotificationKind } from '@/types/database'

/**
 * Navbar bell. Shows unread badge, opens a dropdown of the latest
 * notifications, and routes each item to the relevant conversation / trade /
 * disputes page when clicked.
 */
export function NotificationsBell() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const unread = useUnreadCount()
  const list = useNotifications()
  const markAll = useMarkAllRead()
  const markOne = useMarkNotificationRead()
  const [open, setOpen] = useState(false)

  // Refresh the unread count when the dropdown opens so freshly-arrived
  // items don't look stale.
  useEffect(() => {
    if (open) unread.refetch()
  }, [open, unread])

  const handleSelect = async (n: Notification) => {
    setOpen(false)
    if (!n.read_at) await markOne.mutateAsync(n.id)
    if (n.conversation_id) navigate(`/app/messages/${n.conversation_id}`)
    else if (n.trade_id) navigate(`/app/trade/${n.trade_id}`)
    else if (n.kind === 'dispute_update') navigate('/app/disputes')
  }

  const count = unread.data ?? 0

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('notifications.title')}
          className="relative w-9 h-9 flex items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground hover:text-foreground hover:bg-card transition-all cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl p-0"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <DropdownMenuLabel className="p-0 text-base font-semibold text-foreground">
            {t('notifications.title')}
          </DropdownMenuLabel>
          {count > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                markAll.mutate()
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {t('notifications.markAllRead')}
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="mx-4" />

        {list.isLoading && (
          <div className="px-4 py-8 text-sm text-muted-foreground flex items-center justify-center">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('notifications.loading')}
          </div>
        )}

        {list.data && list.data.length === 0 && (
          <div className="px-4 py-10 text-sm text-muted-foreground text-center">
            <Bell className="w-6 h-6 mx-auto mb-2 opacity-50" />
            {t('notifications.allCaughtUp')}
          </div>
        )}

        {list.data?.map((n) => (
          <NotificationRow key={n.id} notification={n} onSelect={handleSelect} t={t} />
        ))}

        <DropdownMenuSeparator className="mx-4" />
        <Link
          to="/app/messages"
          onClick={() => setOpen(false)}
          className="block px-4 py-3 text-sm text-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {t('notifications.viewAllMessages')}
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationRow({
  notification,
  onSelect,
  t,
}: {
  notification: Notification
  onSelect: (n: Notification) => void
  t: (key: string) => string
}) {
  const unread = !notification.read_at
  return (
    <button
      type="button"
      onClick={() => onSelect(notification)}
      className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-accent transition-colors cursor-pointer ${
        unread ? 'bg-primary/5' : ''
      }`}
    >
      <div className="h-9 w-9 shrink-0 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <KindIcon kind={notification.kind} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium truncate">{notification.title}</p>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {timeAgo(notification.created_at, t)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{notification.body}</p>
      </div>
      {unread && (
        <span className="self-center h-2 w-2 rounded-full bg-primary shrink-0" />
      )}
    </button>
  )
}

const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  message: MessageCircle,
  trade_update: Tag,
  dispute_update: ShieldAlert,
  system: Bell,
}

function KindIcon({ kind }: { kind: NotificationKind }) {
  const Icon = KIND_ICONS[kind] ?? Bell
  return <Icon className="w-4 h-4" />
}

function timeAgo(iso: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return t('notifications.now')
  if (ms < 3_600_000) return t('notifications.minutesAgo', { count: Math.floor(ms / 60_000) })
  if (ms < 86_400_000) return t('notifications.hoursAgo', { count: Math.floor(ms / 3_600_000) })
  return t('notifications.daysAgo', { count: Math.floor(ms / 86_400_000) })
}
