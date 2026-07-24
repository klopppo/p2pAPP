import { useQuery } from '@tanstack/react-query'
import { getActiveOffers, getOfferById, getOffersBySeller } from '@/lib/supabase'
import type { User } from '@/types/database'

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
 * User profile by wallet address (or user_id if already known).
 * Fetches the full users row including cached stats.
 */
export function useUserProfile(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ['user-profile', walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error('No wallet address')
      // Use getUserByWallet which upserts and returns the user
      const { getUserByWallet } = await import('@/lib/supabase')
      return getUserByWallet(walletAddress)
    },
    enabled: !!walletAddress,
  })
}
