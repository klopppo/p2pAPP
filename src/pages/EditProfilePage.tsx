import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useUserProfile } from '@/hooks/useOffers'
import { upsertUser } from '@/lib/supabase'

interface ProfileFormPublic {
  nickname: string
  avatarUrl: string
  bio: string
  location: string
  website: string
  twitterHandle: string
  telegramHandle: string
  githubHandle: string
}

export function EditProfilePage() {
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { data: profile, isLoading } = useUserProfile(address)

  const [publicData, setPublicData] = useState<ProfileFormPublic>({
    nickname: '',
    avatarUrl: '',
    bio: '',
    location: '',
    website: '',
    twitterHandle: '',
    telegramHandle: '',
    githubHandle: '',
  })

  const [saving, setSaving] = useState(false)

  // Initialize form with profile data when loaded
  if (profile && Object.keys(publicData).every(k => publicData[k as keyof ProfileFormPublic] === '')) {
    setPublicData({
      nickname: profile.nickname ?? '',
      avatarUrl: profile.avatar_url ?? '',
      bio: profile.bio ?? '',
      location: profile.location ?? '',
      website: profile.website ?? '',
      twitterHandle: profile.twitter_handle ?? '',
      telegramHandle: profile.telegram_handle ?? '',
      githubHandle: profile.github_handle ?? '',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !isConnected) {
      toast.error('Connect your wallet first')
      return
    }
    setSaving(true)
    try {
      await upsertUser(
        address,
        publicData.nickname || null,
        publicData.avatarUrl || null,
        publicData.bio || null,
        publicData.location || null,
        publicData.website || null,
        publicData.twitterHandle || null,
        publicData.telegramHandle || null,
        publicData.githubHandle || null,
      )
      toast.success('Profile saved')
      navigate(-1)
    } catch (error) {
      console.error('Error saving profile:', error)
      toast.error('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const updatePublic = <K extends keyof ProfileFormPublic>(key: K, value: ProfileFormPublic[K]) =>
    setPublicData({ ...publicData, [key]: value })

  if (!isConnected || !address) {
    return (
      <section className="max-w-xl mx-auto space-y-6 text-center">
        <AppPageHeader title="Edit Profile" variant="centered" onBack={() => navigate(-1)} />
        <Card>
          <CardContent className="p-6 space-y-4">
            <Text variant="h4">Connect your wallet</Text>
            <Text variant="muted" className="text-muted-foreground">
              Connect a wallet to edit your profile.
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
        Loading profile…
      </section>
    )
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <AppPageHeader
        title="Edit Profile"
        subtitle="Update your public information"
        variant="centered"
        onBack={() => navigate(-1)}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Public Information */}
        <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
          {/* Avatar + Nickname & Location */}
          <div className="flex items-center gap-6 mb-4">
            <div className="relative group cursor-pointer">
              <Avatar className="h-24 w-24">
                <AvatarImage src={publicData.avatarUrl || undefined} />
                <AvatarFallback>{(publicData.nickname.slice(0, 2) || '??').toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Pencil className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-3">
              <div>
                <Label htmlFor="nickname" className="text-base font-semibold mb-2">Nickname</Label>
                <Input
                  id="nickname"
                  value={publicData.nickname}
                  onChange={(e) => updatePublic('nickname', e.target.value)}
                  className="rounded-full border border-border"
                  placeholder="Your display name"
                />
              </div>
              <div>
                <Label htmlFor="location" className="text-base font-semibold mb-2">Location</Label>
                <Input
                  id="location"
                  value={publicData.location}
                  onChange={(e) => updatePublic('location', e.target.value)}
                  className="rounded-full border border-border"
                  placeholder="e.g. Europe/Madrid"
                />
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="mb-4">
            <Label htmlFor="bio" className="text-base font-semibold mb-2">Bio</Label>
            <Textarea
              id="bio"
              value={publicData.bio}
              onChange={(e) => updatePublic('bio', e.target.value)}
              className="border border-border min-h-[80px] resize-none"
              placeholder="Tell others about yourself..."
              maxLength={500}
            />
            <p className="text-sm text-muted-foreground mt-1">{publicData.bio.length}/500</p>
          </div>

          {/* Website */}
          <div className="mb-4">
            <Label htmlFor="website" className="text-base font-semibold mb-2">Website</Label>
            <Input
              id="website"
              value={publicData.website}
              onChange={(e) => updatePublic('website', e.target.value)}
              className="rounded-full border border-border"
              placeholder="https://yoursite.com"
            />
          </div>

          {/* Twitter, Telegram & GitHub */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="twitterHandle" className="text-base font-semibold mb-2">Twitter</Label>
              <Input
                id="twitterHandle"
                value={publicData.twitterHandle}
                onChange={(e) => updatePublic('twitterHandle', e.target.value)}
                className="rounded-full border border-border"
                placeholder="@handle"
              />
            </div>
            <div>
              <Label htmlFor="telegramHandle" className="text-base font-semibold mb-2">Telegram</Label>
              <Input
                id="telegramHandle"
                value={publicData.telegramHandle}
                onChange={(e) => updatePublic('telegramHandle', e.target.value)}
                className="rounded-full border border-border"
                placeholder="@handle"
              />
            </div>
            <div>
              <Label htmlFor="githubHandle" className="text-base font-semibold mb-2">GitHub</Label>
              <Input
                id="githubHandle"
                value={publicData.githubHandle}
                onChange={(e) => updatePublic('githubHandle', e.target.value)}
                className="rounded-full border border-border"
                placeholder="username"
              />
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            className="rounded-full px-8 py-3"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="rounded-full px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}