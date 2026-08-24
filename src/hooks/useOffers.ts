import { useQuery } from '@tanstack/react-query'
import {
  ensureUser,
  getActiveOffers,
  getOfferById,
  getOffersBySeller,
} from '@/lib/supabase'

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

/**
 * Offers by a specific seller (wallet address).
 */
export function useOffersBySeller(sellerId: string | undefined) {
  return useQuery({
    queryKey: ['offers', 'seller', sellerId],
    queryFn: () => getOffersBySeller(sellerId!),
    enabled: !!sellerId,
  })
}

/**
 * User profile by wallet address.
 * Uses `ensureUser` which reads from cache first, then DB.
 */
export function useUserProfile(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ['user-profile', walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error('No wallet address')
      return ensureUser(walletAddress)
    },
    enabled: !!walletAddress,
  })
}
