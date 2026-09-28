import { useState, useCallback } from 'react'

export interface CookieConsentState {
  necessary: boolean
  analytics: boolean
  marketing: boolean
  preferences: boolean
}

const STORAGE_KEY = 'cookie-consent'
const DEFAULT_STATE: CookieConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
}

function loadConsent(): CookieConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CookieConsentState) : null
  } catch {
    return null
  }
}

export function useCookieConsent() {
  const [state, setState] = useState(() => {
    const saved = loadConsent()
    return saved ? { consent: saved, hasInteracted: true } : { consent: null, hasInteracted: false }
  })

  const commit = useCallback((consent: CookieConsentState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent))
    setState({ consent, hasInteracted: true })
  }, [])

  const allowAll = useCallback(
    () => commit({ necessary: true, analytics: true, marketing: true, preferences: true }),
    [commit],
  )
  const rejectAll = useCallback(() => commit(DEFAULT_STATE), [commit])
  const savePreferences = useCallback(
    (prefs: CookieConsentState) => commit({ ...prefs, necessary: true }),
    [commit],
  )

  return { consent: state.consent, hasInteracted: state.hasInteracted, allowAll, rejectAll, savePreferences }
}
