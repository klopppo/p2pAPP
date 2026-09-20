import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Fingerprint, RefreshCw, Trash2, ShieldCheck } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { Text } from "@/components/ui/text"
import { Button } from "@/components/ui/button"
import {
  loadCofferIdentity,
  rotateIdentity,
  saveRotatedIdentity,
  burnCofferIdentity,
  profileFingerprint,
  tradePseudonym,
  type CofferIdentity,
} from "@/lib/cofferIdentity"

/**
 * "Coffer Identity" card on the OWN profile. Shows the device-bound pseudo-
 * anonymous fingerprint + a sample per-trade pseudonym, and lets the user
 * rotate (all pseudonyms change) or burn (clear this device's vault). The
 * identity can NOT move funds and is purely app-layer.
 */
export function CofferIdentityCard({ address }: { address: string }) {
  const { t } = useTranslation()
  const [identity, setIdentity] = useState<CofferIdentity | null>(() =>
    loadCofferIdentity()
  )
  const ownId =
    identity && identity.address === address.toLowerCase() ? identity : null
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [samplePseudonym, setSamplePseudonym] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)
  const [confirmingRotate, setConfirmingRotate] = useState(false)
  const [confirmingBurn, setConfirmingBurn] = useState(false)

  useEffect(() => {
    if (!ownId) return
    let cancelled = false
    void profileFingerprint(ownId).then((fp) => {
      if (!cancelled) setFingerprint(fp)
    })
    void tradePseudonym(ownId, "SAMPLE-trade").then((p) => {
      if (!cancelled) setSamplePseudonym(p)
    })
    return () => {
      cancelled = true
    }
  }, [ownId])

  if (!ownId) {
    return (
      <Card className="glass-panel rounded-2xl p-6">
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <Text variant="h4" className="font-bold">
              {t("profile.cofferTitle")}
            </Text>
          </div>
          <Text variant="muted">{t("profile.cofferUnavailable")}</Text>
        </CardContent>
      </Card>
    )
  }

  const handleRotate = async () => {
    setRotating(true)
    try {
      const fresh = saveRotatedIdentity(rotateIdentity(ownId))
      toast.success(t("profile.cofferRotated"))
      setConfirmingRotate(false)
      setIdentity(fresh)
      setFingerprint(null)
      setSamplePseudonym(null)
    } catch {
      toast.error(t("profile.cofferRotateFailed"))
    } finally {
      setRotating(false)
    }
  }

  const handleBurn = () => {
    burnCofferIdentity()
    toast.success(t("profile.cofferBurned"))
    setConfirmingBurn(false)
    setIdentity(null)
    setFingerprint(null)
    setSamplePseudonym(null)
  }

  return (
    <Card className="glass-panel rounded-2xl p-6">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-muted-foreground" />
          <Text variant="h4" className="font-bold">
            {t("profile.cofferTitle")}
          </Text>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {t("profile.cofferFingerprint")}
            </span>
            <span className="font-mono text-xs">{fingerprint ?? "…"}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {t("profile.cofferSampleTrade")}
            </span>
            <span className="font-mono text-xs">{samplePseudonym ?? "…"}</span>
          </div>
        </div>
        <Text variant="muted" className="text-xs leading-relaxed">
          {t("profile.cofferUses")}
        </Text>
        <div className="flex gap-3">
          {confirmingRotate ? (
            <Button
              size="sm"
              className="rounded-full shadow-none"
              onClick={() => void handleRotate()}
              disabled={rotating}
            >
              <RefreshCw
                className={`mr-1 h-3.5 w-3.5 ${rotating ? "animate-spin" : ""}`}
              />
              {t("profile.cofferRotateConfirm")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full shadow-none"
              onClick={() => {
                setConfirmingRotate(true)
                setConfirmingBurn(false)
                window.setTimeout(() => setConfirmingRotate(false), 4000)
              }}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              {t("profile.cofferRotate")}
            </Button>
          )}
          {confirmingBurn ? (
            <Button
              size="sm"
              variant="destructive"
              className="rounded-full shadow-none"
              onClick={handleBurn}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t("profile.cofferBurnConfirm")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full border-destructive/30 text-destructive shadow-none hover:bg-destructive/10"
              onClick={() => {
                setConfirmingBurn(true)
                setConfirmingRotate(false)
                window.setTimeout(() => setConfirmingBurn(false), 4000)
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t("profile.cofferBurn")}
            </Button>
          )}
        </div>
        <Text variant="muted" className="text-xs leading-relaxed">
          {t("profile.cofferBurnNote")}
        </Text>
      </CardContent>
    </Card>
  )
}
