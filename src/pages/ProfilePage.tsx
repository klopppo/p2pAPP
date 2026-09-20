import { useState, useMemo } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import { useAccount } from "wagmi"
import { Button } from "@/components/ui/button"
import { explorerBase } from "@/lib/explorer"
import { Loader2, Pencil, Flag } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ReportUserModal } from "@/components/custom/ReportUserModal"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { OffersTableWrapper } from "@/components/custom/OffersTableWrapper"
import { AppPageHeader } from "@/components/custom/AppPageHeader"
import { Text } from "@/components/ui/text"
import { ArrowUpDown } from "lucide-react"
import { useUserProfile, useOffersBySeller } from "@/hooks/useOffers"
import { useConversations } from "@/hooks/useConversations"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { useGlobalPresence } from "@/hooks/useGlobalPresence"
import { getOrCreateDirectConversation } from "@/lib/supabase"
import { AddressWithActions } from "@/components/custom/AddressWithActions"
import { useTranslation } from "react-i18next"
import { ReviewList } from "@/components/custom/ReviewList"
import { ProfileSocialLinks } from "@/components/custom/ProfileSocialLinks"
import { InviteEarnCard } from "@/components/custom/InviteEarnCard"
import { CofferIdentityCard } from "@/components/custom/CofferIdentityCard"
import { currencySymbol } from "@/lib/utils"

// Local UI shape for the offers table. Mirrors what OffersTableWrapper expects;
// kept here because the data comes from useOffersBySeller (which returns the DB
// row) and needs to be reshaped before being passed down.
interface Offer {
  id: string
  trader: string
  trades: number
  type: "buy" | "sell"
  status: string
  token: string
  amount: string
  price: number
  priceDisplay: string
  currency: string
  minAmount: number
  maxAmount: number
  isPositive: boolean
  isPrivate: boolean
  seller: {
    name: string
    address: string
    avatar?: string
    rating: number
    totalTrades: number
    completionRate: string
    tags: string[]
  }
  paymentMethods: string[]
}

type SortKey = "price" | "minAmount" | "maxAmount"
type SortDir = "asc" | "desc"

function formatNumber(n: number | string | null | undefined): string {
  const num = Number(n) || 0
  return num.toLocaleString()
}

function formatVolume(n: number | string | null | undefined): string {
  const num = Number(n) || 0
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`
  return `$${num.toLocaleString()}`
}

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

export function ProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { walletAddress: urlWalletAddress } = useParams()
  const { address: connectedAddress, isConnected } = useAccount()

  // Target = URL param if present, else connected wallet
  const targetAddress = urlWalletAddress ?? connectedAddress
  const isOwnProfile =
    !urlWalletAddress ||
    targetAddress?.toLowerCase() === connectedAddress?.toLowerCase()

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useUserProfile(targetAddress)
  const { data: user } = useCurrentUser()
  // Live app-wide presence — a user is "online" when they're connected to
  // the app with a wallet RIGHT NOW (not "last_active_at" was ever set).
  const onlineUsers = useGlobalPresence()
  const { data: offers, isLoading: offersLoading } = useOffersBySeller(
    profile?.id
  )
  // Conversation list — used to find a pre-existing thread with the viewed
  // user. Placed before the early returns below so rules-of-hooks is happy.
  const { data: conversations = [] } = useConversations()
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [startingChat, setStartingChat] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const mappedOffers = useMemo<Offer[]>(() => {
    if (!offers) return []

    // useOffersBySeller returns the joined offer+user shape from Supabase;
    // cast through unknown for the loose mapping into the table-friendly shape.
    return offers.map((o) => {
      const row = o as unknown as {
        id: string
        price_per_unit: number | string
        fiat_currency: string
        type: "buy" | "sell"
        crypto_token: string
        crypto_amount: number | string
        min_amount: number | string
        max_amount: number | string
        is_private?: boolean
        status?: string
        tags?: string[]
        payment_methods?: string[]
        seller?: {
          wallet_address?: string
          nickname?: string | null
          avatar_url?: string | null
          avg_rating?: number | string
          total_trades?: number
        }
      }
      const price = Number(row.price_per_unit) || 0
      const symbol = currencySymbol(row.fiat_currency)
      const sellerAddr = row.seller?.wallet_address ?? "0x0"
      return {
        id: row.id,
        trader: sellerAddr,
        trades: row.seller?.total_trades ?? 0,
        type: row.type,
        status: row.status ?? "active",
        token: row.crypto_token,
        amount: String(row.crypto_amount ?? 0),
        price,
        priceDisplay: `${symbol}${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        currency: row.fiat_currency,
        minAmount: Number(row.min_amount) || 0,
        maxAmount: Number(row.max_amount) || 0,
        isPositive: row.type === "buy",
        isPrivate: Boolean(row.is_private),
        seller: {
          name: row.seller?.nickname ?? sellerAddr,
          address: sellerAddr,
          avatar: row.seller?.avatar_url ?? undefined,
          rating: Number(row.seller?.avg_rating) || 0,
          totalTrades: row.seller?.total_trades ?? 0,
          completionRate: "—",
          tags: row.tags ?? [],
        },
        paymentMethods: row.payment_methods ?? [],
      }
    })
  }, [offers])

  const filteredOffers = useMemo(() => {
    const sorted = [...mappedOffers]
    if (sortKey) {
      sorted.sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        return sortDir === "asc" ? aVal - bVal : bVal - aVal
      })
    }
    return sorted
  }, [mappedOffers, sortKey, sortDir])

  // No wallet + no URL target → there is nothing meaningful to render on
  // the main /app/profile route. The Navbar still shows "Profile"
  // (so the user can connect from there), but the page body is empty
  // until they connect. Showing the centered "Connect your wallet" card
  // here was duplicative — the WalletConnectButton in the Navbar already
  // covers it.
  if (!isConnected && isOwnProfile && !urlWalletAddress) {
    return null
  }

  if (profileLoading) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t("profile.loadingProfile")}
      </section>
    )
  }

  if (profileError || !profile) {
    return (
      <section className="mx-auto max-w-xl space-y-6">
        <AppPageHeader
          title={t("profile.title")}
          variant="centered"
          onBack={() => navigate(-1)}
        />
        <Card>
          <CardContent className="space-y-4">
            <Text variant="body" className="text-destructive">
              {t("profile.errorLoading")}
            </Text>
            <Button
              className="rounded-full"
              onClick={() => window.location.reload()}
            >
              {t("profile.retry")}
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  const nickname = profile.nickname ?? "Anonymous"
  const walletAddr = profile.wallet_address ?? targetAddress
  const avatarUrl = profile.avatar_url ?? undefined
  const totalTrades = profile.total_trades ?? 0
  const completedTrades = profile.completed_trades ?? 0
  const cancelledTrades = profile.cancelled_trades ?? 0
  const disputeCount = profile.dispute_count ?? 0
  const completionRate =
    totalTrades > 0
      ? `${Math.round((completedTrades / totalTrades) * 100)}%`
      : "—"
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—"

  // "Message" button — find any conversation with this user via the
  // current user's conversation list. v1's `create_conversation_for_trade`
  // trigger only creates conversation rows at trade creation, so a
  // conversation exists iff the two users share a prior trade. Either
  // buyer or seller of that trade qualifies as a participant.
  // Placed BEFORE the early returns below to satisfy rules-of-hooks.
  // (Hook call lives above with the others.)
  const existingConv = conversations.find((c) => {
    const ids = c.participants.map((p) => p.user_id)
    return ids.includes(user?.id ?? "") && ids.includes(profile.id)
  })
  const canMessage = !!profile && !isOwnProfile && !!user

  const startChat = async () => {
    if (!user || !profile) return
    setStartingChat(true)
    try {
      if (existingConv) {
        navigate(`/app/messages/${existingConv.id}`)
        return
      }
      const convId = await getOrCreateDirectConversation(user.id, profile.id)
      if (convId) navigate(`/app/messages/${convId}`)
      else toast.error(t("profile.errorStartChat"))
    } catch (err) {
      // P0002 = "unknown user" — the other user has no public.users row yet
      // (their wallet never finished SIWE, or the row is still being
      // provisioned by a parallel tab).
      if ((err as { code?: string }).code === "P0002") {
        toast.error(t("profile.errorUnknownUser"))
      } else {
        console.warn("[ProfilePage] start chat failed:", err)
        toast.error(t("profile.errorStartChat"))
      }
    } finally {
      setStartingChat(false)
    }
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-col items-center gap-6 text-center md:flex-row md:items-center md:text-left">
        <Avatar className="h-24 w-24 shrink-0">
          <AvatarImage src={avatarUrl} />
          <AvatarFallback>{nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col items-center md:items-start">
          <div className="flex min-w-0 flex-wrap items-center justify-center gap-3 md:justify-start">
            {/* `h2` bakes in `border-b pb-2`; override both so the name has no
                underline. */}
            <Text variant="h2" className="truncate border-b-0 pb-0">
              {nickname}
            </Text>
            <Badge className="shrink-0 bg-success text-sm text-success-foreground hover:bg-success/90">
              {onlineUsers.has(profile.id)
                ? t("profile.online")
                : t("profile.offline")}
            </Badge>
          </div>
          {/* Wallet-address chip, social handles to its RIGHT. */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 md:justify-start">
            <AddressWithActions
              address={walletAddr}
              explorerBase={explorerBase.address}
              textClassName="font-mono text-xs text-muted-foreground"
              {...(canMessage
                ? {
                    onMessage: startChat,
                    messageDisabled: startingChat,
                    messageLabel: startingChat
                      ? t("profile.messageStarting")
                      : t("profile.message"),
                    messageTitle: t("profile.messageTitle"),
                  }
                : {})}
            />
            <ProfileSocialLinks
              twitterHandle={profile.twitter_handle}
              telegramHandle={profile.telegram_handle}
              githubHandle={profile.github_handle}
              website={profile.website}
            />
          </div>
          {profile.bio && (
            <Text
              variant="muted"
              className="mt-2 line-clamp-3 max-w-2xl leading-relaxed whitespace-pre-line"
            >
              {profile.bio}
            </Text>
          )}
        </div>
        {/* Edit profile button or Report User button */}
        {isOwnProfile ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/app/profile/edit")}
            className="w-full shrink-0 justify-center rounded-full shadow-none md:w-auto"
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />
            {t("profile.editProfile")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReportOpen(true)}
            className="w-full shrink-0 justify-center rounded-full border-destructive/30 text-destructive shadow-none hover:bg-destructive/10 md:w-auto"
          >
            <Flag className="mr-1 h-3.5 w-3.5" />
            {t("report.reportUser")}
          </Button>
        )}
      </div>

      <ReportUserModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        reportedWallet={walletAddr}
      />

      {/* Stats Grid (bento boxes) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Trader Details */}
          <Card>
            <CardContent className="space-y-3">
              <Text variant="h4" className="font-bold">
                {t("profile.traderDetails")}
              </Text>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("profile.memberSince")}
                  </span>
                  <span>{memberSince}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("profile.totalTrades")}
                  </span>
                  <span>{formatNumber(totalTrades)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("profile.completed")}
                  </span>
                  <span>{formatNumber(completedTrades)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("profile.cancelled")}
                  </span>
                  <span>{formatNumber(cancelledTrades)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("profile.disputes")}
                  </span>
                  <span>{formatNumber(disputeCount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("profile.completionRate")}
                  </span>
                  <span>{completionRate}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ratings & Feedback — stars + written reviews */}
          <ReviewList userId={profile.id} />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Invite & Earn — own profile only (reads are owner-scoped by RLS). */}
          {isOwnProfile && user && <InviteEarnCard userId={user.id} />}

          {/* Coffer Identity — device-bound pseudonymous identity (own profile only). */}
          {isOwnProfile && <CofferIdentityCard address={walletAddr} />}

          {/* Total Trades + Total Volume — side by side, half width each */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent>
                <Text
                  variant="small"
                  className="block font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {t("profile.totalTrades")}
                </Text>
                <Text variant="h3" className="mt-1">
                  {formatNumber(totalTrades)}
                </Text>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Text
                  variant="small"
                  className="block font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {t("profile.totalVolume")}
                </Text>
                <Text variant="h3" className="mt-1">
                  {formatVolume(profile.total_volume)}
                </Text>
              </CardContent>
            </Card>
          </div>

          {/* Last 30d Stats */}
          <Card>
            <CardContent className="space-y-3">
              <Text variant="h4" className="font-bold">
                {t("profile.last30Days")}
              </Text>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("profile.trades")}
                  </span>
                  <span>{profile.last_30d_trades ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("profile.volume")}
                  </span>
                  <span>{formatVolume(profile.last_30d_volume)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* User's Offers Table */}
      <div>
        <Text variant="h4" className="mb-4">
          {isOwnProfile
            ? t("profile.yourActiveOffers")
            : t("profile.activeOffers")}
        </Text>
        {offersLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t("profile.loadingOffers")}
          </div>
        ) : filteredOffers.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            {t("profile.noActiveOffers")}
            {isOwnProfile && (
              <Button
                className="ml-2 rounded-full shadow-none"
                onClick={() => navigate("/app/create-offer")}
              >
                {t("profile.createOne")}
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table (md+) */}
            <div className="hidden md:block">
              <OffersTableWrapper>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/50 bg-muted/50">
                      <TableHead>{t("profile.tableType")}</TableHead>
                      <TableHead>{t("profile.tableToken")}</TableHead>
                      <TableHead className="text-right">
                        <SortableHeader
                          label={t("profile.tablePrice")}
                          sortField="price"
                          sortKey={sortKey}
                          onToggle={toggleSort}
                        />
                      </TableHead>
                      <TableHead className="text-right">
                        <SortableHeader
                          label={t("profile.tableMinAmount")}
                          sortField="minAmount"
                          sortKey={sortKey}
                          onToggle={toggleSort}
                        />
                      </TableHead>
                      <TableHead className="text-right">
                        <SortableHeader
                          label={t("profile.tableMaxAmount")}
                          sortField="maxAmount"
                          sortKey={sortKey}
                          onToggle={toggleSort}
                        />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOffers.map((offer) => (
                      <TableRow
                        key={offer.id}
                        onClick={() => navigate(`/app/offer/${offer.id}`)}
                        className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/50"
                      >
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
                            {offer.status !== "active" && (
                              <Badge
                                variant="secondary"
                                className="rounded-full"
                              >
                                {offer.status === "completed"
                                  ? t("trades.statusCompleted")
                                  : offer.status === "cancelled"
                                    ? t("trades.statusCancelled")
                                    : offer.status}
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
                  </TableBody>
                </Table>
              </OffersTableWrapper>
            </div>

            {/* Mobile cards (<md) */}
            <ul className="space-y-3 md:hidden">
              {filteredOffers.map((offer) => (
                <li key={offer.id}>
                  <Link
                    to={`/app/offer/${offer.id}`}
                    className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="rounded-2xl border border-border/50 bg-background/50 p-5 shadow-xl backdrop-blur-xl transition-colors group-hover:border-primary/50 group-hover:bg-background/70">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-base font-semibold">
                          {offer.token}
                        </span>
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
                          {offer.status !== "active" && (
                            <Badge
                              variant="secondary"
                              className="rounded-full text-xs"
                            >
                              {offer.status === "completed"
                                ? t("trades.statusCompleted")
                                : offer.status === "cancelled"
                                  ? t("trades.statusCancelled")
                                  : offer.status}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="shrink-0 font-mono">
                          {offer.priceDisplay}
                        </span>
                        <span className="truncate">
                          {offer.currency} {offer.minAmount.toLocaleString()} –{" "}
                          {offer.currency} {offer.maxAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
