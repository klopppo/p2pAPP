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
    if (!raw) return null
    return JSON.parse(raw) as CookieConsentState
  } catch {
    return null
  }
}

function saveConsent(state: CookieConsentState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function getInitialState(): { consent: CookieConsentState | null; hasInteracted: boolean } {
  const saved = loadConsent()
  return saved ? { consent: saved, hasInteracted: true } : { consent: null, hasInteracted: false }
}

export function useCookieConsent() {
  const [state, setState] = useState(getInitialState)

  const allowAll = useCallback(() => {
    const updated: CookieConsentState = {
      necessary: true,
      analytics: true,
      marketing: true,
      preferences: true,
    }
    saveConsent(updated)
    setState({ consent: updated, hasInteracted: true })
  }, [])

  const rejectAll = useCallback(() => {
    saveConsent(DEFAULT_STATE)
    setState({ consent: DEFAULT_STATE, hasInteracted: true })
  }, [])

  const savePreferences = useCallback((prefs: CookieConsentState) => {
    const withNecessary = { ...prefs, necessary: true }
    saveConsent(withNecessary)
    setState({ consent: withNecessary, hasInteracted: true })
  }, [])

  return {
    consent: state.consent,
    hasInteracted: state.hasInteracted,
    allowAll,
    rejectAll,
    savePreferences,
  }
}
