import { useState } from 'react'
import { toast } from 'sonner'
import {
  Copy,
  Gift,
  Users,
  Link2,
  Coins,
  Check,
  Loader2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  buildReferralUrl,
  sharePercent,
} from '@/lib/referral'
import { useReferralDashboard } from '@/hooks/useReferral'
import { getOrCreateReferralCode } from '@/lib/supabase'

/**
 * "Invite & Earn" card on the OWN profile. Shows the referral link (with a
 * copy button), the referrer share, referred-friend count and the earnings
 * ledger (pending / total). Reads are owner-scoped via RLS.
 */
export function InviteEarnCard({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const { data, isLoading, refetch } = useReferralDashboard(userId)
  const [revealingCode, setRevealingCode] = useState(false)
  const [copied, setCopied] = useState(false)

  const code = data?.code ?? null
  const share = sharePercent()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildReferralUrl(code ?? ''))
      setCopied(true)
      toast.success(t('referral.linkCopied'))
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error(t('referral.copyFailed'))
    }
  }

  const handleReveal = async () => {
    if (code) {
      setRevealingCode(false)
      return
    }
    setRevealingCode(true)
    try {
      const fresh = await getOrCreateReferralCode()
      if (fresh) await refetch()
    } catch {
      toast.error(t('referral.revealFailed'))
    } finally {
      setRevealingCode(false)
    }
  }

  const pending = data?.pendingEarned ?? 0
  const total = data?.totalEarned ?? 0

  return (
    <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-accent/20 text-brand-accent p-2 shrink-0">
            <Gift className="w-4 h-4" />
          </span>
          <Text variant="h4" className="font-bold">{t('referral.title')}</Text>
          <Badge className="rounded-full ml-auto">{share}</Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('referral.loading')}
          </div>
        ) : code ? (
          <>
            {/* Your invite link */}
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <code className="font-mono text-sm truncate flex-1 bg-muted/60 border border-border/50 rounded-full px-3 py-1.5">
                {buildReferralUrl(code)}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full shadow-none shrink-0"
                onClick={handleCopy}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="ml-1">{copied ? t('referral.copied') : t('referral.copy')}</span>
              </Button>
            </div>

            {/* Earnings ledger */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground block">
                  {t('referral.pending')}
                </Text>
                <Text variant="h3" className="mt-1">
                  {pending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </div>
              <div>
                <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground block">
                  {t('referral.totalEarned')}
                </Text>
                <Text variant="h3" className="mt-1">
                  {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </div>
            </div>

            {/* Referred friends */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="w-4 h-4" />
                <span>{t('referral.friends')} ({data?.referred.length ?? 0})</span>
                <Coins className="w-4 h-4 ml-auto" />
                <span>{t('referral.trades')} ({data?.events.length ?? 0})</span>
              </div>
              {data && data.referred.length > 0 && (
                <ul className="space-y-1.5">
                  {data.referred.slice(0, 4).map((r) => {
                    const addr = r.referred?.wallet_address
                    const label = r.referred?.nickname
                      ?? (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—')
                    return (
                      <li
                        key={r.id}
                        className="flex items-center justify-between text-sm bg-muted/40 border border-border/40 rounded-xl px-3 py-2"
                      >
                        <span className="font-mono truncate pr-2">{label}</span>
                        <Badge variant={r.status === 'active' ? 'default' : 'secondary'} className="rounded-full text-xs">
                          {r.status}
                        </Badge>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <Button className="rounded-full shadow-none w-full" onClick={handleReveal} disabled={revealingCode}>
            {revealingCode && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            {t('referral.getMyLink')}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}