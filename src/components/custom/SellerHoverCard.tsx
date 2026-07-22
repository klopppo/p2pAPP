import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Copy, ExternalLink } from 'lucide-react'

export interface SellerPreview {
  name: string
  address: string
  avatar?: string
  rating: number
  totalTrades: number
  completionRate: string
  tags?: string[]
}

interface SellerHoverCardProps {
  seller: SellerPreview
  children: React.ReactNode
}

export function SellerHoverCard({ seller, children }: SellerHoverCardProps) {
  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  const onCopy = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr)
    } catch (e) {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = addr
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
  }

  const onOpen = (addr: string) => {
    const base = 'https://blockscan.com/token/'
    const url = `${base}${addr}`
    window.open(url, '_blank', 'noopener')
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-80 p-0 shadow-none rounded-2xl"
      >
        <div className="px-5 py-4 space-y-4">
          {/* Seller header */}
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              <AvatarImage src={seller.avatar} />
              <AvatarFallback>{seller.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <Text variant="h4" className="truncate">{seller.name}</Text>
              <div className="flex items-center gap-2">
                <Text variant="small" className="font-mono text-muted-foreground">
                  {formatAddress(seller.address)}
                </Text>
                <div className="ml-auto flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onCopy(seller.address) }} title="Copia indirizzo">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onOpen(seller.address) }} title="Apri su Blockscan">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1">
              <span className="text-primary">★</span>
              <span className="font-medium">{seller.rating}</span>
            </div>
            <span className="text-muted-foreground">·</span>
            <span><span className="font-medium">{seller.totalTrades.toLocaleString()}</span> <span className="text-muted-foreground">trades</span></span>
            <span className="text-muted-foreground">·</span>
            <span><span className="font-medium">{seller.completionRate}</span> <span className="text-muted-foreground">completion</span></span>
          </div>

          {/* Tags */}
          {seller.tags && seller.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {seller.tags.map((t) => (
                <Badge key={t} variant="secondary" className="rounded-full text-xs">{t}</Badge>
              ))}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
