import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Text } from "@/components/ui/text"
import { useTranslation } from "react-i18next"

export interface SellerPreview {
  name: string
  /** Opaque public label (`CN-<hex>`) — NEVER a wallet address (ADR-015).
   *  The wallet only surfaces at trade intent. */
  handle?: string
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
  const { t } = useTranslation()

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl p-0 shadow-none"
      >
        <div className="space-y-4 px-5 py-4">
          {/* Seller header */}
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              <AvatarImage src={seller.avatar} />
              <AvatarFallback>
                {seller.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <Text variant="h4" className="truncate">
                {seller.name}
              </Text>
              {seller.handle && (
                <Text
                  variant="small"
                  className="font-mono text-muted-foreground"
                >
                  {seller.handle}
                </Text>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1">
              <span className="text-primary">★</span>
              <span className="font-medium">{seller.rating}</span>
            </div>
            <span className="text-muted-foreground">·</span>
            <span>
              <span className="font-medium">
                {seller.totalTrades.toLocaleString()}
              </span>{" "}
              <span className="text-muted-foreground">
                {t("sellerHoverCard.trades")}
              </span>
            </span>
            <span className="text-muted-foreground">·</span>
            <span>
              <span className="font-medium">{seller.completionRate}</span>{" "}
              <span className="text-muted-foreground">
                {t("sellerHoverCard.completion")}
              </span>
            </span>
          </div>

          {/* Tags */}
          {seller.tags && seller.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {seller.tags.map((t) => (
                <Badge
                  key={t}
                  variant="secondary"
                  className="rounded-full text-xs"
                >
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
