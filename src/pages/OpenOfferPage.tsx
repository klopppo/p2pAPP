import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useAccount } from "wagmi"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Text } from "@/components/ui/text"
import { AppPageHeader } from "@/components/custom/AppPageHeader"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Clock, Shield, Loader2, Star } from "lucide-react"
import { useOffer } from "@/hooks/useOffers"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { startOfferConversation } from "@/lib/supabase"
import { currencySymbol } from "@/lib/utils"
import { REGION_NAMES } from "@/lib/locations"

export function OpenOfferPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data: offer, isLoading, isError } = useOffer(id)
  const { isConnected } = useAccount()
  const { data: user } = useCurrentUser()
  const [startingChat, setStartingChat] = useState(false)

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />{" "}
        {t("openOffer.loadingOffer")}
      </section>
    )
  }

  if (isError || !offer) {
    return (
      <section>
        <AppPageHeader
          title={t("openOffer.offerNotFound")}
          variant="split"
          onBack={() => navigate(-1)}
        />
        <Card className="glass-panel rounded-2xl p-6">
          <CardContent>
            <Text variant="body" className="text-muted-foreground">
              {t("openOffer.offerNotFoundDescription")}
            </Text>
            <Button
              className="mt-4 rounded-full"
              onClick={() => navigate("/app/offers")}
            >
              {t("openOffer.backToOffers")}
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  const price = Number(offer.price_per_unit) || 0
  const minAmount = Number(offer.min_amount) || 0
  const maxAmount = Number(offer.max_amount) || 0
  const symbol = currencySymbol(offer.fiat_currency)
  const seller = offer.seller
  const sellerName = seller?.nickname ?? seller?.public_handle ?? "Trader"
  const sellerHandle = seller?.public_handle ?? ""
  const isOwner = !!user && !!seller && user.public_handle === sellerHandle

  // The seller is identified by its opaque `public_handle` only; the real uid
  // + wallet are resolved server-side by `start_offer_conversation`.
  const canMessage = !!user && isConnected && !isOwner && !!seller
  const startChat = async () => {
    if (!user || !seller) return
    setStartingChat(true)
    try {
      const convId = await startOfferConversation(offer.id)
      if (convId) navigate(`/app/messages/${convId}`)
      else toast.error(t("openOffer.errorStartChat"))
    } catch (err) {
      // P0002 = "unknown user" — the seller has no public.users row yet.
      if ((err as { code?: string }).code === "P0002") {
        toast.error(t("openOffer.errorUnknownUser"))
      } else {
        console.warn("[OpenOfferPage] start chat failed:", err)
        toast.error(t("openOffer.errorStartChat"))
      }
    } finally {
      setStartingChat(false)
    }
  }
  const regions =
    (offer.available_regions ?? [])
      .map((r: string) => REGION_NAMES[r] ?? r)
      .join(", ") || "Global"

  const expiresAt = offer.expires_at ? new Date(offer.expires_at) : null
  const gracePeriodHours = Number(offer.grace_period) || 0

  return (
    <section>
      <AppPageHeader
        title={t("openOffer.viewOffer")}
        subtitle={t("openOffer.subtitle")}
        variant="split"
        onBack={() => navigate(-1)}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Offer Details */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="glass-panel rounded-2xl p-6">
            <CardContent className="px-6 py-0">
              {/* Trader Info */}
              <div className="mb-3 flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarImage src={seller?.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {sellerName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex w-full min-w-0 flex-1 flex-col items-center sm:items-start">
                  <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <Text variant="h4" className="truncate">
                      {sellerName}
                    </Text>
                    {sellerHandle && (
                      <Text
                        variant="small"
                        className="shrink-0 font-mono text-muted-foreground"
                      >
                        {sellerHandle}
                      </Text>
                    )}
                    <Badge
                      className="shrink-0"
                      variant={
                        seller?.verification_level === "verified" ||
                        seller?.verification_level === "trusted"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {seller?.verification_level ?? t("openOffer.unverified")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm sm:justify-start">
                    <div className="flex items-center gap-1">
                      {Number(seller?.avg_rating) ? (
                        <>
                          <Star className="h-4 w-4 fill-primary text-primary" />
                          <span>{Number(seller?.avg_rating).toFixed(1)}</span>
                        </>
                      ) : (
                        <>
                          <Star className="h-4 w-4 text-muted-foreground/60" />
                          <span className="text-muted-foreground">
                            {t("openOffer.noRating")}
                          </span>
                        </>
                      )}
                    </div>
                    <div>
                      {(seller?.total_trades ?? 0).toLocaleString()}{" "}
                      {t("openOffer.trades")}
                    </div>
                    {canMessage && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={startChat}
                        disabled={startingChat}
                      >
                        {startingChat
                          ? t("openOffer.messageStarting")
                          : t("openOffer.message")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Expiry */}
              {expiresAt && (
                <Alert className="mb-3">
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    {t("openOffer.offerExpires", {
                      date: expiresAt.toLocaleString(),
                    })}
                  </AlertDescription>
                </Alert>
              )}

              {/* Offer Details
                  Vertical label-on-top / value-below per the design system
                  (`mb-2` rhythm for label → content in form/detail cards).
                  `items-start` on the grid keeps each cell at its content
                  height instead of stretching to the row's tallest cell, so
                  the row gap stays consistent regardless of value size. */}
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Text variant="small" className="text-muted-foreground">
                    {t("openOffer.type")}
                  </Text>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={offer.type === "buy" ? "default" : "secondary"}
                      className="rounded-full"
                    >
                      {offer.type} {offer.crypto_token}
                    </Badge>
                    {offer.is_private && (
                      <Badge variant="outline" className="rounded-full">
                        {t("offers.private")}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Text variant="small" className="text-muted-foreground">
                    {t("openOffer.pricePerUnit", { token: offer.crypto_token })}
                  </Text>
                  <Text variant="h3">
                    {symbol}
                    {price.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                </div>
                <div className="space-y-1.5">
                  <Text variant="small" className="text-muted-foreground">
                    {t("openOffer.amountRange")}
                  </Text>
                  <Text variant="body">
                    {symbol}
                    {minAmount.toLocaleString()} – {symbol}
                    {maxAmount.toLocaleString()}
                  </Text>
                </div>
                <div className="space-y-1.5">
                  <Text variant="small" className="text-muted-foreground">
                    {t("openOffer.location")}
                  </Text>
                  <Text variant="body">{regions}</Text>
                </div>
                <div className="space-y-1.5">
                  <Text variant="small" className="text-muted-foreground">
                    {t("openOffer.gracePeriod")}
                  </Text>
                  <Text variant="body">
                    {gracePeriodHours > 0
                      ? t("openOffer.gracePeriodValue", {
                          count: gracePeriodHours,
                        })
                      : "—"}
                  </Text>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="mt-4">
                <Text variant="small" className="mb-1.5 text-muted-foreground">
                  {t("openOffer.paymentMethod")}
                </Text>
                <div className="flex flex-wrap items-center gap-2">
                  {(offer.payment_methods ?? []).map((m: string) => (
                    <Badge key={m} className="rounded-full">
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Description */}
              {offer.description && (
                <div className="mt-4">
                  <Text
                    variant="small"
                    className="mb-1.5 text-muted-foreground"
                  >
                    {t("openOffer.description")}
                  </Text>
                  <Text
                    variant="body"
                    className="leading-6 whitespace-pre-wrap"
                  >
                    {offer.description}
                  </Text>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Acceptance Terms */}
          <Card className="glass-panel rounded-2xl p-6">
            <CardContent className="px-6 py-0">
              <Text variant="h4" className="mb-2 font-semibold">
                {t("openOffer.acceptanceTerms")}
              </Text>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>
                  •{" "}
                  {t("openOffer.termRange", {
                    min: `${symbol}${minAmount.toLocaleString()}`,
                    max: `${symbol}${maxAmount.toLocaleString()}`,
                  })}
                </li>
                <li>• {t("openOffer.termPayment")}</li>
                <li>• {t("openOffer.termVerify")}</li>
                <li>• {t("openOffer.termEscrow")}</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Actions Sidebar */}
        <div className="space-y-4">
          <Card className="glass-panel rounded-2xl p-6">
            <CardContent>
              <div className="space-y-3">
                <div className="text-center">
                  <Text variant="h4">{t("openOffer.readyToTrade")}</Text>
                  <Text variant="muted" className="mt-1 text-sm">
                    {t("openOffer.readyToTradeSubtitle")}
                  </Text>
                </div>
                {user && seller && user.public_handle === sellerHandle ? (
                  // Seller viewing their own offer: skip "Continue to trade"
                  // (trading with yourself makes no sense) and surface Edit
                  // instead. The ownership check uses the same join shape as
                  // `useCurrentUser` (`user.id`) and the embedded seller row.
                  <>
                    <Button
                      className="w-full rounded-full"
                      size="lg"
                      onClick={() => navigate(`/app/offer/${offer.id}/edit`)}
                    >
                      {t("openOffer.editOffer")}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      {t("openOffer.editOfferHint")}
                    </p>
                  </>
                ) : (
                  <Button
                    className="w-full rounded-full"
                    size="lg"
                    onClick={() => navigate(`/app/trade/${offer.id}`)}
                  >
                    {t("openOffer.continueToTrade")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel rounded-2xl p-6">
            <CardContent>
              <Text variant="h4" className="mb-2 font-semibold">
                {t("openOffer.securityNote")}
              </Text>
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-5 w-5 text-green-500" />
                <div>
                  <Text variant="small" className="mb-1 font-semibold">
                    {t("openOffer.escrowProtection")}
                  </Text>
                  <p className="text-xs text-muted-foreground">
                    {t("openOffer.escrowProtectionDescription")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
