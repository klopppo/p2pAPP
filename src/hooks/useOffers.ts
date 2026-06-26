import { useQuery } from '@tanstack/react-query'
import { getActiveOffers, getOfferById } from '@/lib/supabase'

/**
 * Active offers list (first page). react-query is already mounted in App.tsx
 * via QueryClientProvider; this is the first read-side usage and gives the
 * pages clean loading/error states.
 */
export function useOffers() {
  return useQuery({
    queryKey: ['offers'],
    queryFn: () => getActiveOffers(50),
  })
}

/**
 * A single offer by primary key (the `:id` route param), with the seller joined.
 * Disabled until an id is present.
 */
export function useOffer(id: string | undefined) {
  return useQuery({
    queryKey: ['offer', id],
    queryFn: () => getOfferById(id as string),
    enabled: !!id,
  })
}
