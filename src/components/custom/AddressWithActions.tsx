import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  address: string
  className?: string
  explorerBase?: string
  copyToastMessage?: string
  showText?: boolean
  textClassName?: string
}

export const formatAddress = (addr: string) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '')

export function AddressWithActions({
  address,
  className = '',
  explorerBase = 'https://etherscan.io/address/',
  copyToastMessage,
  showText = true,
  textClassName = 'font-mono text-xs text-muted-foreground',
}: Props) {
  const { t } = useTranslation()
  const resolvedCopyMessage = copyToastMessage ?? t('addressActions.copiedToast')

  if (!address) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(address)
    toast.success(resolvedCopyMessage)
  }

  const handleOpen = () => {
    window.open(`${explorerBase}${address}`, '_blank', 'noopener')
  }

  return (
    <div className={className + ' flex items-center gap-2'}>
      {showText && (
        <Text variant="small" className={textClassName}>{formatAddress(address)}</Text>
      )}
      <div className="ml-1 flex items-center gap-1">
        <Button size="icon" variant="ghost" onClick={handleCopy} title={t('addressActions.copyAddress')}>
          <Copy className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={handleOpen} title={t('addressActions.openOnExplorer')}>
          <ExternalLink className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

export default AddressWithActions
