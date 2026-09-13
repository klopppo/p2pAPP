import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'

/**
 * Only the fallback locale (en) is bundled. Every other locale is a
 * lazily-imported Vite chunk (import.meta.glob) fetched the first time it
 * is selected, then kept in i18next's resource store. This keeps ~90% of
 * the translation weight out of the first payload while keeping `t()`
 * synchronous (react-i18next never suspends: a dangling `t()` call
 * resolves against the always-present `en` fallback).
 */
const localeModules = import.meta.glob('./locales/*.json')
const loadedLangs = new Set<string>(['en'])

async function ensureLoaded(lng: string): Promise<void> {
  if (loadedLangs.has(lng)) return
  const loader = localeModules[`./locales/${lng}.json`]
  if (!loader) {
    console.warn(`[i18n] no locale chunk for "${lng}"`)
    return
  }
  loadedLangs.add(lng) // added before the await → no re-entrant double load
  const mod = (await loader()) as { default: Record<string, unknown> }
  i18n.addResourceBundle(lng, 'translation', mod.default)
}

const savedLang =
  typeof localStorage !== 'undefined' ? localStorage.getItem('coffernode-lang') || 'en' : 'en'

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('coffernode-lang', lng)
  if (!loadedLangs.has(lng)) {
    void ensureLoaded(lng).then(() => {
      // Resource arrived after the first change fired — switch again only
      // if the user hasn't picked yet another language meanwhile.
      if (i18n.language === lng) i18n.changeLanguage(lng)
    })
  }
})

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })

// Warm the persisted language without gating first paint: init already ran
// synchronously against `en`, so everything renders; this just re-points the
// UI once the real bundle is in. A no-op for `en` users.
if (savedLang !== 'en') {
  void ensureLoaded(savedLang).then(() => {
    if (i18n.language === 'en' || i18n.language !== savedLang) {
      i18n.changeLanguage(savedLang)
    }
  })
}

export default i18n