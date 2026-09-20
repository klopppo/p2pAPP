import { useQuery } from "@tanstack/react-query"
import {
  ensureUser,
  getActiveOffers,
  getOfferById,
  getPublicOffersBySeller,
} from "@/lib/supabase"

/**
 * Active offers list (first page). react-query is already mounted in App.tsx
 * via QueryClientProvider; this is the first read-side usage and gives the
 * pages clean loading/error states.
 */
export function useOffers() {
  return useQuery({
    queryKey: ["offers"],
    queryFn: () => getActiveOffers(50),
  })
}

/**
 * A single offer by primary key (the `:id` route param), with the seller joined.
 * Disabled until an id is present.
 */
export function useOffer(id: string | undefined) {
  return useQuery({
    queryKey: ["offer", id],
    queryFn: () => getOfferById(id as string),
    enabled: !!id,
  })
}

/**
 * Offers by a specific seller (opaque `public_handle` — ADR-015). Resolved
 * server-side so anonymous readers never receive the seller's uid.
 */
export function useOffersBySeller(publicHandle: string | undefined) {
  return useQuery({
    queryKey: ["offers", "seller", publicHandle],
    queryFn: () => getPublicOffersBySeller(publicHandle!),
    enabled: !!publicHandle,
  })
}

/**
 * User profile by wallet address.
 * Uses `ensureUser` which reads from cache first, then DB.
 */
export function useUserProfile(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ["user-profile", walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error("No wallet address")
      return ensureUser(walletAddress)
    },
    enabled: !!walletAddress,
  })
}
