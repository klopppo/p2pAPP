import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Cookie, Settings, Shield, BarChart3, Megaphone, SlidersHorizontal, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Text } from '@/components/ui/text'
import { Separator } from '@/components/ui/separator'
import { useCookieConsent, type CookieConsentState } from '@/hooks/useCookieConsent'

export function CookieConsent() {
  const { consent, hasInteracted, allowAll, rejectAll, savePreferences } = useCookieConsent()
  const { t } = useTranslation()
  const [showSettings, setShowSettings] = useState(false)
  const [tempPrefs, setTempPrefs] = useState<CookieConsentState>({
    necessary: true,
    analytics: false,
    marketing: false,
    preferences: false,
  })

  const COOKIE_CATEGORIES = [
    {
      key: 'necessary' as const,
      label: t('cookieConsent.necessary'),
      description: t('cookieConsent.necessaryDescription'),
      icon: Shield,
      disabled: true,
    },
    {
      key: 'analytics' as const,
      label: t('cookieConsent.analytics'),
      description: t('cookieConsent.analyticsDescription'),
      icon: BarChart3,
      disabled: false,
    },
    {
      key: 'marketing' as const,
      label: t('cookieConsent.marketing'),
      description: t('cookieConsent.marketingDescription'),
      icon: Megaphone,
      disabled: false,
    },
    {
      key: 'preferences' as const,
      label: t('cookieConsent.preferences'),
      description: t('cookieConsent.preferencesDescription'),
      icon: SlidersHorizontal,
      disabled: false,
    },
  ]

  const handleToggle = (key: keyof CookieConsentState) => {
    setTempPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = () => {
    savePreferences(tempPrefs)
  }

  const handleOpenSettings = () => {
    if (consent) {
      setTempPrefs(consent)
    }
    setShowSettings(true)
  }

  if (hasInteracted) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
      >
        <div className="mx-auto max-w-[1000px]">
          <AnimatePresence mode="wait">
            {!showSettings ? (
              <motion.div
                key="banner"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2 }}
                className="glass-panel rounded-2xl p-6"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <Cookie className="size-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <Text variant="h4" className="text-base font-semibold">
                        {t('cookieConsent.privacyTitle')}
                      </Text>
                      <Text variant="muted" className="max-w-lg text-sm">
                        {t('cookieConsent.privacyDescription')}
                      </Text>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full shadow-none"
                      onClick={handleOpenSettings}
                    >
                      <Settings className="size-4" />
                      {t('cookieConsent.settings')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full shadow-none"
                      onClick={rejectAll}
                    >
                      {t('cookieConsent.rejectAll')}
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-full shadow-none"
                      onClick={allowAll}
                    >
                      {t('cookieConsent.allowAll')}
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2 }}
                className="glass-panel rounded-2xl p-6"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cookie className="size-5 text-primary" />
                      <Text variant="h4" className="text-base font-semibold">
                        {t('cookieConsent.preferencesTitle')}
                      </Text>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full shadow-none"
                      onClick={() => setShowSettings(false)}
                    >
                      <ChevronRight className="size-4 rotate-180" />
                      {t('cookieConsent.back')}
                    </Button>
                  </div>

                  <Text variant="muted" className="text-sm">
                    {t('cookieConsent.preferencesDescription')}
                  </Text>

                  <Separator />

                  <div className="space-y-1">
                    {COOKIE_CATEGORIES.map((cat) => {
                      const Icon = cat.icon
                      return (
                        <div
                          key={cat.key}
                          className="flex items-center justify-between rounded-xl px-3 py-3 transition-colors hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                              <Icon className="size-4 text-muted-foreground" />
                            </div>
                            <div className="space-y-0.5">
                              <Text variant="small" className="text-sm font-medium">
                                {cat.label}
                              </Text>
                              <p className="text-xs text-muted-foreground">
                                {cat.description}
                              </p>
                            </div>
                          </div>
                          <Switch
                            size="sm"
                            checked={tempPrefs[cat.key]}
                            onCheckedChange={() => handleToggle(cat.key)}
                            disabled={cat.disabled}
                          />
                        </div>
                      )
                    })}
                  </div>

                  <Separator />

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full shadow-none"
                      onClick={rejectAll}
                    >
                      {t('cookieConsent.rejectAll')}
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-full shadow-none"
                      onClick={handleSave}
                    >
                      {t('cookieConsent.savePreferences')}
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-full shadow-none"
                      onClick={allowAll}
                    >
                      {t('cookieConsent.allowAll')}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
