import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { Copy, ExternalLink, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { explorerBase as defaultExplorerBase } from '@/lib/explorer'
import { shortAddress } from '@/lib/utils'

type Props = {
  address: string
  className?: string
  explorerBase?: string
  copyToastMessage?: string
  showText?: boolean
  textClassName?: string
  /** When set, renders a Message button that navigates to /app/messages/:convId. */
  onMessage?: () => void
  messageTitle?: string
  messageLabel?: string
  messageDisabled?: boolean
}

/** Address pill with inline actions (Copy, Explorer, optional Message). */
export function AddressWithActions({
  address,
  className = '',
  explorerBase = defaultExplorerBase.address,
  copyToastMessage,
  showText = true,
  textClassName = 'font-mono text-xs text-muted-foreground',
  onMessage,
  messageTitle,
  messageLabel,
  messageDisabled,
}: Props) {
  const { t } = useTranslation()
  const resolvedCopyMessage = copyToastMessage ?? t('addressActions.copiedToast')
  const resolvedMessageTitle = messageTitle ?? t('addressActions.messageTitle')

  if (!address) return null

  const handleCopy = () => {
    // `writeText` rejects in insecure contexts / when permission is denied —
    // swallow it so it can't surface as an unhandled rejection.
    try {
      const pending = navigator.clipboard?.writeText(address)
      if (pending) void pending.catch(() => {})
    } catch {
      // Clipboard API unavailable — copying is best-effort.
    }
    toast.success(resolvedCopyMessage)
  }

  const handleOpen = () => {
    window.open(`${explorerBase}${address}`, '_blank', 'noopener')
  }

  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 py-0.5 pl-3 pr-1 ' +
        className
      }
    >
      {showText && (
        <Text variant="small" className={textClassName}>
          {shortAddress(address)}
        </Text>
      )}
      {showText && (
        <span aria-hidden className="h-3.5 w-px bg-border/60" />
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        className="rounded-full h-6 w-6"
        onClick={handleCopy}
        title={t('addressActions.copyAddress')}
        aria-label={t('addressActions.copyAddress')}
      >
        <Copy className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="rounded-full h-6 w-6"
        onClick={handleOpen}
        title={t('addressActions.openOnExplorer')}
        aria-label={t('addressActions.openOnExplorer')}
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </Button>
      {onMessage && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="rounded-full"
          onClick={onMessage}
          disabled={messageDisabled}
          title={resolvedMessageTitle}
          aria-label={messageLabel ?? resolvedMessageTitle}
        >
          <MessageCircle className="w-3.5 h-3.5" />
        </Button>
      )}
    </span>
  )
}

export default AddressWithActions
