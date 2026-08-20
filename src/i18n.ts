import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import zh from './locales/zh.json'
import tr from './locales/tr.json'

const savedLang = typeof localStorage !== 'undefined'
  ? localStorage.getItem('coffernode-lang') || 'en'
  : 'en'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      zh: { translation: zh },
      tr: { translation: tr },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('coffernode-lang', lng)
})

export default i18n
