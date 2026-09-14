import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribe to a CSS media query. SSR-safe (returns `false` on the server).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onStoreChange)
      return () => mql.removeEventListener('change', onStoreChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** True on `md:` and up (matches Tailwind's default 768px breakpoint). */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)')
}
