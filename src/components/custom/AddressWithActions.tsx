import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { Copy, ExternalLink, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { explorerBase as defaultExplorerBase } from '@/lib/explorer'

type Props = {
  address: string
  className?: string
  explorerBase?: string
  copyToastMessage?: string
  showText?: boolean
  textClassName?: string
  /**
   * If provided, a Message icon button is rendered alongside Copy / Open
   * in Explorer. The handler should navigate to /app/messages/:convId or
   * create-and-navigate when the conversation doesn't exist yet.
   */
  onMessage?: () => void
  messageTitle?: string
  messageLabel?: string
  messageDisabled?: boolean
}

export const formatAddress = (addr: string) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '')

/**
 * Compact address pill with inline action buttons (Copy, Open in Explorer,
 * optional Message). Wraps text + icons in a single bordered pill so the
 * three actions read as one unit attached to the address (GitLab commit-SHA
 * + Primer ButtonGroup idiom). 32×32 icon hit areas clear the iOS/Material
 * touch minimum for compact metadata rows.
 */
export function AddressWithActions({
  address,
  className = '',
  explorerBase = defaultExplorerBase.token,
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
    navigator.clipboard.writeText(address)
    toast.success(resolvedCopyMessage)
  }

  const handleOpen = () => {
    window.open(`${explorerBase}${address}`, '_blank', 'noopener')
  }

  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 py-1 pl-3 pr-1 ' +
        className
      }
    >
      {showText && (
        <Text variant="small" className={textClassName}>
          {formatAddress(address)}
        </Text>
      )}
      {showText && (
        <span aria-hidden className="h-3.5 w-px bg-border/60" />
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        className="rounded-full"
        onClick={handleCopy}
        title={t('addressActions.copyAddress')}
        aria-label={t('addressActions.copyAddress')}
      >
        <Copy className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="rounded-full"
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
