import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useUserProfile } from '@/hooks/useOffers'
import { updateUserProfile } from '@/lib/supabase'

interface ProfileForm {
  nickname: string
  avatarUrl: string
  bio: string
  location: string
  website: string
  twitterHandle: string
  telegramHandle: string
  githubHandle: string
}

const EMPTY_FORM: ProfileForm = {
  nickname: '',
  avatarUrl: '',
  bio: '',
  location: '',
  website: '',
  twitterHandle: '',
  telegramHandle: '',
  githubHandle: '',
}

export function EditProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { data: profile, isLoading } = useUserProfile(address)
  const qc = useQueryClient()

  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const hydrated = useRef(false)
  const wasOnboarding = useRef(false)

  useEffect(() => {
    if (!profile || hydrated.current) return
    hydrated.current = true
    if (!profile.nickname) wasOnboarding.current = true
    setForm({
      nickname: profile.nickname ?? '',
      avatarUrl: profile.avatar_url ?? '',
      bio: profile.bio ?? '',
      location: profile.location ?? '',
      website: profile.website ?? '',
      twitterHandle: profile.twitter_handle ?? '',
      telegramHandle: profile.telegram_handle ?? '',
      githubHandle: profile.github_handle ?? '',
    })
  }, [profile])

  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !isConnected) {
      toast.error(t('editProfile.errorConnectWallet'))
      return
    }
    setSaving(true)
    try {
      await updateUserProfile(address, {
        nickname: form.nickname || null,
        avatarUrl: form.avatarUrl || null,
        bio: form.bio || null,
        location: form.location || null,
        website: form.website || null,
        twitterHandle: form.twitterHandle || null,
        telegramHandle: form.telegramHandle || null,
        githubHandle: form.githubHandle || null,
      })
      toast.success(t('editProfile.successSaved'))
      qc.invalidateQueries({ queryKey: ['current-user', address] })
      qc.invalidateQueries({ queryKey: ['user-profile', address] })
      if (wasOnboarding.current) {
        navigate('/app/profile', { replace: true })
      } else {
        navigate(-1)
      }
    } catch (err) {
      console.error('Error saving profile:', err)
      toast.error(t('editProfile.errorSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (!isConnected || !address) {
    return (
      <section className="max-w-xl mx-auto space-y-6 text-center">
        <AppPageHeader title={t('editProfile.title')} variant="centered" onBack={() => navigate(-1)} />
        <Card>
          <CardContent className="space-y-4">
            <Text variant="h4">{t('editProfile.connectWallet')}</Text>
            <Text variant="muted" className="text-muted-foreground">
              {t('editProfile.connectWalletDescription')}
            </Text>
          </CardContent>
        </Card>
      </section>
    )
  }

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {t('editProfile.loadingProfile')}
      </section>
    )
  }

  return (
    <section className="space-y-8">
      <div className="max-w-xl mx-auto space-y-4">
        <AppPageHeader
          title={t('editProfile.title')}
          subtitle={t('editProfile.subtitle')}
          variant="centered"
          onBack={() => navigate(-1)}
        />

        <form onSubmit={handleSubmit} className="space-y-3">
          <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
            <div className="flex items-center gap-6 mb-4">
              <div className="relative group cursor-pointer">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={form.avatarUrl || undefined} />
                  <AvatarFallback>{(form.nickname.slice(0, 2) || '??').toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Pencil className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-3">
                <div>
                  <Label htmlFor="nickname" className="text-base font-semibold mb-2 block">{t('editProfile.nickname')}</Label>
                  <Input
                    id="nickname"
                    value={form.nickname}
                    onChange={(e) => update('nickname', e.target.value)}
                    className="rounded-full border border-border"
                    placeholder={t('editProfile.nicknamePlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="location" className="text-base font-semibold mb-2 block">{t('editProfile.location')}</Label>
                  <Input
                    id="location"
                    value={form.location}
                    onChange={(e) => update('location', e.target.value)}
                    className="rounded-full border border-border"
                    placeholder={t('editProfile.locationPlaceholder')}
                  />
                </div>
              </div>
            </div>

            <div className="mb-4">
              <Label htmlFor="bio" className="text-base font-semibold mb-2 block">{t('editProfile.bio')}</Label>
              <Textarea
                id="bio"
                value={form.bio}
                onChange={(e) => update('bio', e.target.value)}
                className="border border-border min-h-[80px] resize-none"
                placeholder={t('editProfile.bioPlaceholder')}
                maxLength={500}
              />
              <p className="text-sm text-muted-foreground mt-1">{form.bio.length}/500</p>
            </div>

            <div className="mb-4">
              <Label htmlFor="website" className="text-base font-semibold mb-2 block">{t('editProfile.website')}</Label>
              <Input
                id="website"
                value={form.website}
                onChange={(e) => update('website', e.target.value)}
                className="rounded-full border border-border"
                placeholder={t('editProfile.websitePlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="twitterHandle" className="text-base font-semibold mb-2 block">{t('editProfile.twitter')}</Label>
                <Input
                  id="twitterHandle"
                  value={form.twitterHandle}
                  onChange={(e) => update('twitterHandle', e.target.value)}
                  className="rounded-full border border-border"
                  placeholder={t('editProfile.handlePlaceholder')}
                />
              </div>
              <div>
                <Label htmlFor="telegramHandle" className="text-base font-semibold mb-2 block">{t('editProfile.telegram')}</Label>
                <Input
                  id="telegramHandle"
                  value={form.telegramHandle}
                  onChange={(e) => update('telegramHandle', e.target.value)}
                  className="rounded-full border border-border"
                  placeholder={t('editProfile.handlePlaceholder')}
                />
              </div>
              <div>
                <Label htmlFor="githubHandle" className="text-base font-semibold mb-2 block">{t('editProfile.github')}</Label>
                <Input
                  id="githubHandle"
                  value={form.githubHandle}
                  onChange={(e) => update('githubHandle', e.target.value)}
                  className="rounded-full border border-border"
                  placeholder={t('editProfile.githubPlaceholder')}
                />
              </div>
            </div>
          </Card>

          <div className="flex justify-between pt-2">
            <Button type="button" variant="outline" onClick={() => navigate(-1)} className="rounded-full px-8 py-3">
              {t('editProfile.cancel')}
            </Button>
            <Button type="submit" disabled={saving} className="rounded-full px-8 py-3">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('editProfile.saving')}
                </>
              ) : (
                t('editProfile.saveChanges')
              )}
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}