import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, Gift } from 'lucide-react'
import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  isValidReferralCode,
  savePendingReferral,
} from '@/lib/referral'

const REFERRAL_GO_MS = 900

/**
 * Public referral landing: `/r/:code`.
 *
 * Validates the code against the same 8-hex format the DB enforces, stores it
 * (first-touch attribution) and sends the visitor to the marketplace landing.
 * If they later connect a NEW wallet, useSyncUser claims the code once the
 * session is established — no email capture, GDPR-friendly by design.
 */
export function ReferralLandingPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const valid = isValidReferralCode(code)

  useEffect(() => {
    if (!valid) return
    savePendingReferral(code)
    // Give the toast/transition a beat, then land on the marketplace.
    const t = window.setTimeout(() => navigate('/', { replace: true }), REFERRAL_GO_MS)
    return () => window.clearTimeout(t)
  }, [code, valid, navigate])

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-4">
          <Card className="glass-panel rounded-2xl p-6">
            <CardContent className="space-y-4">
              <Text variant="h4" className="font-bold flex items-center gap-2">
                <Gift className="w-4 h-4" /> Invalid referral link
              </Text>
              <Text variant="muted">
                This invite link isn't valid. If you were expecting to join a
                friend here, ask them to resend their link.
              </Text>
              <Button className="rounded-full shadow-none" onClick={() => navigate('/', { replace: true })}>
                Go to CofferNode
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-4">
        <Card className="glass-panel rounded-2xl p-6">
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-success text-success-foreground p-2 shrink-0">
                <Gift className="w-4 h-4" />
              </span>
              <div>
                <Text variant="h4" className="font-bold">You were invited!</Text>
                <Text variant="muted">
                  A friend on CofferNode invited you. Connect your wallet to
                  sign up — when you complete your first trade, they earn a
                  reward.
                </Text>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Taking you to CofferNode…
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ReferralLandingPage