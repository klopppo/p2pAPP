import { useQuery } from '@tanstack/react-query'
import { useAccount, useChainId, usePublicClient } from 'wagmi'
import type { Abi } from 'viem'
import {
  KLEROS_ESCROW_FACTORY_ABI,
  KLEROS_ESCROW_FACTORY_ADDRESS,
  isFactoryConfigured,
} from '@/lib/contracts'

/** Cap on `escrowBy*` index reads per verification; over-cap fails closed. */
export const MAX_ESCROW_SCAN = 200

/**
 * Trust gate for fund-moving actions on a KlerosEsc clone: a trade's
 * `escrow_contract_addr` comes from a Supabase row, so before approving/sending
 * tokens verify the address is one the configured factory deployed for the
 * connected wallet (case-insensitive membership check). Absence (pending,
 * factory missing, RPC failure, over-cap) is treated as unverified.
 */
export function useVerifiedEscrow(escrowAddress: `0x${string}` | undefined) {
  const { address } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const wallet = address?.toLowerCase() ?? null
  const factoryReady = isFactoryConfigured()

  const query = useQuery<boolean>({
    queryKey: ['escrow-verified', chainId, wallet, escrowAddress],
    enabled: !!publicClient && !!wallet && !!escrowAddress && factoryReady,
    // Factory deployments are append-only, so a positive result stays valid.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!publicClient || !wallet || !escrowAddress || !factoryReady) return false
      const c = publicClient
      const factory = KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`
      const walletArg = wallet as `0x${string}`

      const [buyerCount, sellerCount] = (await c.multicall({
        contracts: [
          { address: factory, abi: KLEROS_ESCROW_FACTORY_ABI as Abi, functionName: 'escrowCountByBuyer', args: [walletArg] },
          { address: factory, abi: KLEROS_ESCROW_FACTORY_ABI as Abi, functionName: 'escrowCountBySeller', args: [walletArg] },
        ],
        allowFailure: false,
      })) as [bigint, bigint]

      // Interleave both lists newest-first, capped at MAX_ESCROW_SCAN reads —
      // the escrow being funded is normally the most recent deployment.
      const calls: Array<{ functionName: 'escrowByBuyer' | 'escrowBySeller'; index: bigint }> = []
      for (let depth = 0n; calls.length < MAX_ESCROW_SCAN; depth++) {
        const buyerIndex = buyerCount - 1n - depth
        const sellerIndex = sellerCount - 1n - depth
        if (buyerIndex >= 0n) calls.push({ functionName: 'escrowByBuyer', index: buyerIndex })
        if (sellerIndex >= 0n) calls.push({ functionName: 'escrowBySeller', index: sellerIndex })
        if (buyerIndex < 0n && sellerIndex < 0n) break
      }
      if (calls.length === 0) return false

      const members = (await c.multicall({
        contracts: calls.map((call) => ({
          address: factory,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: call.functionName,
          args: [walletArg, call.index],
        })),
        allowFailure: false,
      })) as readonly `0x${string}`[]

      const target = escrowAddress.toLowerCase()
      return members.some((member) => member.toLowerCase() === target)
    },
  })

  return {
    isVerified: query.data === true,
    // `isLoading` (isPending && isFetching) — NOT `isPending`, which is also
    // true for a disabled query that never ran.
    isVerifying: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
