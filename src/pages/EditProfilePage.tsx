import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { AppPageHeader } from '@/components/custom/AppPageHeader'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Pencil } from 'lucide-react'

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

interface ProfileFormPrivate {
  email: string
  phone: string
  twofaEnabled: boolean
  dailyLimit: number
  weeklyLimit: number
  walletLockEnabled: boolean
  walletLockThreshold: number
}

export function EditProfilePage() {
  const navigate = useNavigate()

  const [publicData, setPublicData] = useState<ProfileFormPublic>({
    nickname: 'CryptoKing',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645745-095597429a3b?auto=format&fit=crop&q=80&w=100&h=100',
    bio: '',
    location: 'Europe/Madrid',
    website: '',
    twitterHandle: '',
    telegramHandle: '',
    githubHandle: '',
  })

  const [privateData, setPrivateData] = useState<ProfileFormPrivate>({
    email: 'crypto@example.com',
    phone: '',
    twofaEnabled: false,
    dailyLimit: 10000,
    weeklyLimit: 50000,
    walletLockEnabled: false,
    walletLockThreshold: 80,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Saving profile:', { publicData, privateData })
    navigate(-1)
  }

  const updatePublic = <K extends keyof ProfileFormPublic>(key: K, value: ProfileFormPublic[K]) =>
    setPublicData({ ...publicData, [key]: value })

  const updatePrivate = <K extends keyof ProfileFormPrivate>(key: K, value: ProfileFormPrivate[K]) =>
    setPrivateData({ ...privateData, [key]: value })

  return (
      <div className="w-full max-w-xl mx-auto">
        <AppPageHeader
          title="Edit Profile"
          subtitle="Update your public and private information"
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
                  <AvatarImage src={publicData.avatarUrl} />
                  <AvatarFallback>{publicData.nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
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

          {/* Private Information */}
          <Card className="bg-background/50 backdrop-blur-xl shadow-xl border border-border/50 p-6 rounded-2xl">
            <Text variant="h4" className="font-bold mb-4">Private Information</Text>

            {/* Email & Phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="email" className="text-base font-semibold mb-2">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={privateData.email}
                  onChange={(e) => updatePrivate('email', e.target.value)}
                  className="rounded-full border border-border"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <Label htmlFor="phone" className="text-base font-semibold mb-2">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={privateData.phone}
                  onChange={(e) => updatePrivate('phone', e.target.value)}
                  className="rounded-full border border-border"
                  placeholder="+1 234 567 8900"
                />
              </div>
            </div>

            {/* 2FA Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Two-Factor Authentication</Label>
                <p className="text-sm text-muted-foreground">Extra security layer</p>
              </div>
              <Switch
                checked={privateData.twofaEnabled}
                onCheckedChange={(checked) => updatePrivate('twofaEnabled', checked)}
              />
            </div>

            {/* TODO: Trading Limits & Wallet Lock — uncomment when ready
            <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground block mb-3 mt-4">
              Trading Limits
            </Text>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="dailyLimit" className="text-base font-semibold mb-2">Daily Limit (USD)</Label>
                <Input
                  id="dailyLimit"
                  type="number"
                  value={privateData.dailyLimit}
                  onChange={(e) => updatePrivate('dailyLimit', Number(e.target.value))}
                  className="rounded-full border border-border"
                  placeholder="10000"
                />
              </div>
              <div>
                <Label htmlFor="weeklyLimit" className="text-base font-semibold mb-2">Weekly Limit (USD)</Label>
                <Input
                  id="weeklyLimit"
                  type="number"
                  value={privateData.weeklyLimit}
                  onChange={(e) => updatePrivate('weeklyLimit', Number(e.target.value))}
                  className="rounded-full border border-border"
                  placeholder="50000"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Wallet Lock</Label>
                <p className="text-sm text-muted-foreground">Confirm trades above threshold</p>
              </div>
              <Switch
                checked={privateData.walletLockEnabled}
                onCheckedChange={(checked) => updatePrivate('walletLockEnabled', checked)}
              />
            </div>

            {privateData.walletLockEnabled && (
              <div className="mt-4">
                <Label htmlFor="walletLockThreshold" className="text-base font-semibold mb-2">Lock Threshold (%)</Label>
                <Input
                  id="walletLockThreshold"
                  type="number"
                  min={0}
                  max={100}
                  value={privateData.walletLockThreshold}
                  onChange={(e) => updatePrivate('walletLockThreshold', Number(e.target.value))}
                  className="rounded-full border border-border"
                  placeholder="80"
                />
              </div>
            )}
            */}
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
              className="rounded-full px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Save Changes
            </Button>
          </div>
        </form>
      </div>
  )
}
