import { useState, useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useAccount } from "wagmi"
import { useOffers } from "@/hooks/useOffers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { AppPageHeader } from "@/components/custom/AppPageHeader"
import {
  SellerHoverCard,
  type SellerPreview,
} from "@/components/custom/SellerHoverCard"
import { FullDropdown } from "@/components/custom/FullDropdown"
import { MaskedList, useInfiniteList } from "@/components/infinite-list"
import { ArrowUpDown, Loader2, MapPin } from "lucide-react"
import { currencySymbol } from "@/lib/utils"
import { LOCATIONS, REGION_NAMES, offerMatchesLocation } from "@/lib/locations"

interface Offer {
  id: string
  trader: string
  trades: number
  type: "buy" | "sell"
  token: string
  amount: string
  price: number
  priceDisplay: string
  currency: string
  minAmount: number
  maxAmount: number
  isPositive: boolean
  isPrivate: boolean
  /** Wallet the private offer is addressed to (null for public offers). */
  targetUser: string | null
  seller: SellerPreview
  paymentMethods: string[]
  /** ISO region codes persisted on the offer (empty = Global). */
  regions: string[]
  /** Human location labels persisted on the offer (same as picker values). */
  tags: string[]
}

type SortKey = "price" | "minAmount" | "maxAmount"
type SortDir = "asc" | "desc"

// Shape returned by getActiveOffers() (select * + joined seller). NUMERIC
// columns arrive as strings from PostgREST, so they are coerced with Number().
interface OfferRow {
  id: string
  type: "buy" | "sell"
  crypto_token: string
  crypto_amount: number | string
  fiat_currency: string
  price_per_unit: number | string
  min_amount: number | string
  max_amount: number | string
  is_private?: boolean
  target_user?: string | null
  payment_methods?: string[] | null
  tags?: string[] | null
  available_regions?: string[] | null
  seller?: {
    public_handle?: string | null
    nickname?: string | null
    avatar_url?: string | null
    total_trades?: number
    avg_rating?: number | string | null
  } | null
}

function mapOfferRow(o: OfferRow): Offer {
  const price = Number(o.price_per_unit) || 0
  const sellerHandle = o.seller?.public_handle ?? o.seller?.nickname ?? "CN-??"
  const symbol = currencySymbol(o.fiat_currency)
  return {
    id: o.id,
    trader: sellerHandle,
    trades: o.seller?.total_trades ?? 0,
    type: o.type,
    token: o.crypto_token,
    amount: String(o.crypto_amount ?? 0),
    price,
    priceDisplay: `${symbol}${price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    currency: o.fiat_currency,
    minAmount: Number(o.min_amount) || 0,
    maxAmount: Number(o.max_amount) || 0,
    isPositive: o.type === "buy",
    isPrivate: Boolean(o.is_private),
    targetUser: o.target_user ?? null,
    seller: {
      name: o.seller?.nickname ?? sellerHandle,
      handle: sellerHandle,
      avatar: o.seller?.avatar_url ?? undefined,
      rating: Number(o.seller?.avg_rating) || 0,
      totalTrades: o.seller?.total_trades ?? 0,
      completionRate: "—",
      tags: o.tags ?? [],
    },
    paymentMethods: o.payment_methods ?? [],
    regions: o.available_regions ?? [],
    tags: o.tags ?? [],
  }
}

const PAGE_SIZE = 10

function SortableHeader({
  label,
  sortField,
  sortKey,
  onToggle,
}: {
  label: string
  sortField: SortKey
  sortKey: SortKey | null
  onToggle: (key: SortKey) => void
}) {
  return (
    <button
      onClick={() => onToggle(sortField)}
      className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
    >
      {label}
      <ArrowUpDown
        className={`h-3.5 w-3.5 ${sortKey === sortField ? "text-foreground" : "text-muted-foreground/50"}`}
      />
    </button>
  )
}

export function OffersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { address } = useAccount()
  const { data, isLoading, isError } = useOffers()
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [tokenFilter, setTokenFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")
  const [locationFilter, setLocationFilter] = useState("all")
  const offers = useMemo<Offer[]>(() => (data ?? []).map(mapOfferRow), [data])
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const list = useInfiniteList({ pageSize: PAGE_SIZE })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const filteredOffers = useMemo(() => {
    const filtered = offers.filter((offer) => {
      const matchesSearch =
        offer.trader.toLowerCase().includes(searchQuery.toLowerCase()) ||
        offer.token.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = typeFilter === "all" || offer.type === typeFilter
      const matchesToken = tokenFilter === "all" || offer.token === tokenFilter
      // Payment filter - check if any offer payment method contains the filter value
      const matchesPayment =
        paymentFilter === "all" ||
        offer.paymentMethods.some((m: string) =>
          m.toLowerCase().includes(paymentFilter.toLowerCase())
        )
      // Location filter — matches persisted region codes (or tag labels).
      const matchesLocation =
        locationFilter === "all" ||
        offerMatchesLocation(offer.regions, offer.tags, locationFilter)
      return (
        matchesSearch &&
        matchesType &&
        matchesToken &&
        matchesPayment &&
        matchesLocation
      )
    })

    if (sortKey) {
      filtered.sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        return sortDir === "asc" ? aVal - bVal : bVal - aVal
      })
    }

    // Private offers addressed to the connected wallet float to the top.
    const myAddr = address?.toLowerCase()
    const isPrivateToMe = (o: Offer) =>
      o.isPrivate && !!myAddr && o.targetUser?.toLowerCase() === myAddr
    const pinned = filtered.filter(isPrivateToMe)
    if (pinned.length === 0) return filtered
    return [...pinned, ...filtered.filter((o) => !isPrivateToMe(o))]
  }, [
    offers,
    searchQuery,
    typeFilter,
    tokenFilter,
    paymentFilter,
    locationFilter,
    sortKey,
    sortDir,
    address,
  ])

  const loadMore = () => {
    list.nextPage()
  }

  return (
    <section>
      {/* Header */}
      <AppPageHeader
        title={t("offers.title")}
        subtitle={t("offers.subtitle")}
        variant="split"
        action={
          <Link to="/app/create-offer">
            <Button className="rounded-full shadow-none">
              {t("offers.createOffer")}
            </Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder={t("offers.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-full border-border sm:max-w-xs"
        />
        <div className="flex flex-wrap items-center gap-3">
          <FullDropdown
            label={t("offers.typeLabel")}
            value={typeFilter}
            onSelect={setTypeFilter}
            options={[
              { label: t("offers.filterAll"), value: "all" },
              { label: t("offers.filterBuy"), value: "buy" },
              { label: t("offers.filterSell"), value: "sell" },
            ]}
          />
          <FullDropdown
            label={t("offers.tokenLabel")}
            value={tokenFilter}
            onSelect={setTokenFilter}
            options={[
              { label: t("offers.filterAll"), value: "all" },
              { label: "fUSD", value: "fUSD" },
              { label: "USDT", value: "USDT" },
              { label: "USDC", value: "USDC" },
              { label: "DAI", value: "DAI" },
              { label: "ETH", value: "ETH" },
              { label: "WBTC", value: "WBTC" },
              { label: "BTC", value: "BTC" },
            ]}
          />
          <FullDropdown
            label={t("offers.paymentLabel")}
            value={paymentFilter}
            onSelect={setPaymentFilter}
            options={[
              { label: t("offers.filterAll"), value: "all" },
              { label: t("offers.filterPaymentBank"), value: "bank" },
              { label: t("offers.filterPaymentPaypal"), value: "paypal" },
              { label: t("offers.filterPaymentWise"), value: "wise" },
            ]}
          />
          <FullDropdown
            label={t("offers.locationLabel")}
            value={locationFilter}
            onSelect={setLocationFilter}
            options={[
              { label: t("offers.filterAll"), value: "all" },
              ...LOCATIONS.map((l) => ({ label: l, value: l })),
            ]}
          />
        </div>
      </div>

      {/* Loading / Error / Empty — shared */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 inline-block h-5 w-5 animate-spin" />
          {t("offers.loadingOffers")}
        </div>
      ) : isError ? (
        <div className="py-16 text-center text-muted-foreground">
          {t("offers.errorLoading")}
        </div>
      ) : filteredOffers.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          No offers match your filters.
        </div>
      ) : (
        <>
          {/* ── Desktop table (md+) ── */}
          <div className="hidden md:block">
            <Table className="border-separate border-spacing-0">
              <TableHeader>
                {/* `border-separate` is required for the corner radius
                            on the header cells to render (with collapse,
                            radius on th/tr is ignored). Cell backgrounds +
                            borders provide the header fill and the row
                            separators. */}
                <TableRow className="[&>th]:border-b [&>th]:border-border/50 [&>th]:bg-muted/50 [&>th:first-child]:rounded-tl-2xl [&>th:last-child]:rounded-tr-2xl">
                  <TableHead>{t("offers.tableTrader")}</TableHead>
                  <TableHead>{t("offers.tableType")}</TableHead>
                  <TableHead>{t("offers.tableToken")}</TableHead>
                  <TableHead className="text-right">
                    <SortableHeader
                      label={t("offers.tablePrice")}
                      sortField="price"
                      sortKey={sortKey}
                      onToggle={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortableHeader
                      label={t("offers.tableMinAmount")}
                      sortField="minAmount"
                      sortKey={sortKey}
                      onToggle={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortableHeader
                      label={t("offers.tableMaxAmount")}
                      sortField="maxAmount"
                      sortKey={sortKey}
                      onToggle={toggleSort}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_td]:border-b [&_td]:border-border/50 [&_tr:last-child>td]:border-b-0">
                <MaskedList {...list}>
                  {filteredOffers.map((offer) => (
                    <TableRow
                      key={offer.id}
                      onClick={() => navigate(`/app/offer/${offer.id}`)}
                      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/50"
                    >
                      <TableCell>
                        <SellerHoverCard seller={offer.seller}>
                          <div className="flex cursor-default items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {offer.trader.slice(2, 4).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-mono text-sm">
                                {offer.trader}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {offer.trades} trades
                              </div>
                            </div>
                          </div>
                        </SellerHoverCard>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              offer.type === "buy" ? "default" : "secondary"
                            }
                            className="rounded-full"
                          >
                            {offer.type}
                          </Badge>
                          {offer.isPrivate && (
                            <Badge variant="outline" className="rounded-full">
                              {t("offers.private")}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {offer.token}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {offer.priceDisplay}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {offer.currency} {offer.minAmount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {offer.currency} {offer.maxAmount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </MaskedList>
              </TableBody>
            </Table>
          </div>

          {/* ── Mobile cards (<md) ── */}
          <ul className="space-y-3 md:hidden">
            <MaskedList {...list}>
              {filteredOffers.map((offer) => (
                <li key={offer.id}>
                  <Link
                    to={`/app/offer/${offer.id}`}
                    className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="rounded-2xl border border-border/50 bg-background/50 p-5 shadow-xl backdrop-blur-xl transition-colors group-hover:border-primary/50 group-hover:bg-background/70">
                      {/* Top row: token + price */}
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-base font-semibold">
                            {offer.token}
                          </span>
                          <span className="mx-1.5 font-normal text-muted-foreground">
                            ·
                          </span>
                          <span className="font-mono font-semibold text-primary">
                            {offer.priceDisplay}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge
                            variant={
                              offer.type === "buy" ? "default" : "secondary"
                            }
                            className="rounded-full text-xs"
                          >
                            {offer.type}
                          </Badge>
                          {offer.isPrivate && (
                            <Badge
                              variant="outline"
                              className="rounded-full text-xs"
                            >
                              {t("offers.private")}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Trader row */}
                      <SellerHoverCard seller={offer.seller}>
                        <div className="mb-3 flex cursor-default items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-[10px]">
                              {offer.trader.slice(2, 4).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate font-mono text-sm">
                            {offer.trader}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {offer.trades} trades
                          </span>
                        </div>
                      </SellerHoverCard>

                      {/* Meta row: location + amounts + payment */}
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {offer.regions.length > 0
                              ? offer.regions
                                  .map((r) => REGION_NAMES[r] ?? r)
                                  .join(", ")
                              : t("offers.locationGlobal")}
                          </span>
                        </span>
                        <span className="font-mono">
                          {offer.currency} {offer.minAmount.toLocaleString()} –{" "}
                          {offer.currency} {offer.maxAmount.toLocaleString()}
                        </span>
                        {offer.paymentMethods.length > 0 && (
                          <span className="truncate">
                            {offer.paymentMethods.slice(0, 2).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </MaskedList>
          </ul>
        </>
      )}

      {/* Load More */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {Math.min(list.displayLimit, filteredOffers.length)} of{" "}
          {filteredOffers.length} offers
        </div>
        {list.displayLimit < filteredOffers.length && (
          <Button
            onClick={loadMore}
            variant="outline"
            className="rounded-full shadow-none"
          >
            Load More
          </Button>
        )}
      </div>
    </section>
  )
}
