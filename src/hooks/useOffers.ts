import { useQuery } from '@tanstack/react-query'
import {
  ensureUser,
  getActiveOffers,
  getOfferById,
  getPublicOffersBySeller,
} from '@/lib/supabase'

export function useOffers() {
  return useQuery({
    queryKey: ['offers'],
    queryFn: () => getActiveOffers(50),
  })
}

export function useOffer(id: string | undefined) {
  return useQuery({
    queryKey: ['offer', id],
    queryFn: () => getOfferById(id as string),
    enabled: !!id,
  })
}

/** Offers by a seller's opaque `public_handle` (ADR-015). */
export function useOffersBySeller(publicHandle: string | undefined) {
  return useQuery({
    queryKey: ['offers', 'seller', publicHandle],
    queryFn: () => getPublicOffersBySeller(publicHandle!),
    enabled: !!publicHandle,
  })
}

/** User profile by wallet address (read-through cache). */
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
