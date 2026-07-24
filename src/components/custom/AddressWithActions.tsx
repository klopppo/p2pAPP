import React from 'react'
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
  copyToastMessage = 'Indirizzo copiato',
  showText = true,
  textClassName = 'font-mono text-xs text-muted-foreground',
}: Props) {
  if (!address) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(address)
    toast.success(copyToastMessage)
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
        <Button size="icon" variant="ghost" onClick={handleCopy} title="Copia indirizzo">
          <Copy className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={handleOpen} title="Apri su explorer">
          <ExternalLink className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

export default AddressWithActions
