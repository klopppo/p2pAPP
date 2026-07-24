import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import {
  getDisputeById,
  getDisputesByUser,
} from '@/lib/supabase'
import {
  KLEROS_ESC_ABI,
  KLEROS_ESCROW_FACTORY_ABI,
  KLEROS_ESCROW_FACTORY_ADDRESS,
  encodeKlerosExtraData,
} from '@/lib/contracts'
import type { Abi } from 'viem'

/**
 * All disputes where the connected wallet is buyer or seller (Supabase).
 * Disabled until a wallet is connected (no userId to filter on).
 */
export function useDisputes() {
  const { address } = useAccount()
  return useQuery({
    queryKey: ['disputes', 'by-wallet', address],
    queryFn: async () => {
      const { getUserByWallet } = await import('@/lib/supabase')
      const user = address ? await getUserByWallet(address) : null
      if (!user) return []
      return getDisputesByUser(user.id)
    },
    enabled: !!address,
  })
}

/**
 * Single dispute by primary UUID, used by the detail viewer.
 */
export function useDispute(id: string | undefined) {
  return useQuery({
    queryKey: ['dispute', id],
    queryFn: () => getDisputeById(id as string),
    enabled: !!id,
  })
}

/** Paginated read of the connected wallet's KlerosEsc clones (factory). */
export function useUserEscrows() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const factoryReady = !!KLEROS_ESCROW_FACTORY_ADDRESS

  return useQuery({
    queryKey: ['user-escrows', address, KLEROS_ESCROW_FACTORY_ADDRESS],
    enabled: !!address && !!publicClient && factoryReady,
    queryFn: async (): Promise<`0x${string}`[]> => {
      if (!address || !publicClient || !factoryReady) return []
      const c = publicClient
      const buyerCount = (await c.readContract({
        address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
        abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
        functionName: 'escrowCountByBuyer',
        args: [address],
      })) as bigint
      const sellerCount = (await c.readContract({
        address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
        abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
        functionName: 'escrowCountBySeller',
        args: [address],
      })) as bigint

      const buyerAdds: `0x${string}`[] = []
      for (let i = 0n; i < buyerCount; i++) {
        buyerAdds.push(
          (await c.readContract({
            address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
            abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
            functionName: 'escrowByBuyer',
            args: [address, i],
          })) as `0x${string}`,
        )
      }
      const sellerAdds: `0x${string}`[] = []
      for (let i = 0n; i < sellerCount; i++) {
        sellerAdds.push(
          (await c.readContract({
            address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
            abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
            functionName: 'escrowBySeller',
            args: [address, i],
          })) as `0x${string}`,
        )
      }
      // De-dupe (a user could be both buyer and seller on the same escrow).
      return Array.from(new Set([...buyerAdds, ...sellerAdds]))
    },
  })
}

/**
 * Read the live state of a single KlerosEsc clone (state machine + identity +
 * dispute metadata). Cheap — uses multicall-style batch reads where possible.
 */
export function useEscrowState(escrowAddress: `0x${string}` | undefined) {
  const publicClient = usePublicClient()
  return useQuery({
    queryKey: ['escrow-state', escrowAddress],
    enabled: !!publicClient && !!escrowAddress,
    queryFn: async () => {
      if (!publicClient || !escrowAddress) return null
      const c = publicClient
      // Each readContract is one RPC call — we batch by issuing them in
      // parallel with Promise.all. viem's readContract supports multicall
      // natively; using sequential calls here for clarity. A multicall
      // wrapper can replace this if RPC budgets become tight.
      const read = <T>(fn: string, args: readonly unknown[] = []) =>
        c.readContract({
          address: escrowAddress,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: fn,
          args,
        }) as Promise<T>

      const [
        token,
        buyer,
        seller,
        klerosCourt,
        gracePeriod,
        feeBps,
        tradeAmount,
        securityDepositPct,
        state,
        disputeCreated,
        klerosDisputeID,
        currentRuling,
        rulingReceivedTime,
        disputeTimestamp,
        evidenceGroupID,
      ] = await Promise.all([
        read<`0x${string}`>('token'),
        read<`0x${string}`>('buyer'),
        read<`0x${string}`>('seller'),
        read<`0x${string}`>('klerosCourt'),
        read<bigint>('gracePeriod'),
        read<bigint>('feeBps'),
        read<bigint>('tradeAmount'),
        read<bigint>('securityDepositPct'),
        read<number>('state'),
        read<boolean>('disputeCreated'),
        read<bigint>('klerosDisputeID'),
        read<bigint>('currentRuling'),
        read<bigint>('rulingReceivedTime'),
        read<bigint>('disputeTimestamp'),
        read<bigint>('evidenceGroupID'),
      ])

      return {
        token,
        buyer,
        seller,
        klerosCourt,
        gracePeriod,
        feeBps,
        tradeAmount,
        securityDepositPct,
        state,
        disputeCreated,
        klerosDisputeID,
        currentRuling,
        rulingReceivedTime,
        disputeTimestamp,
        evidenceGroupID,
      }
    },
  })
}

/**
 * Read the live KlerosCourt arbitration cost for raising a dispute on a given
 * escrow. Returns wei (bigint). Returns null if the call fails or the court
 * isn't reachable.
 */
export function useArbitrationCost(escrowAddress: `0x${string}` | undefined) {
  const publicClient = usePublicClient()
  return useQuery({
    queryKey: ['arbitration-cost', escrowAddress],
    enabled: !!publicClient && !!escrowAddress,
    queryFn: async (): Promise<bigint | null> => {
      if (!publicClient || !escrowAddress) return null
      const c = publicClient
      try {
        const [part1, part2] = await Promise.all([
          c.readContract({
            address: escrowAddress,
            abi: KLEROS_ESC_ABI as Abi,
            functionName: 'klerosExtraDataPart1',
          }) as Promise<`0x${string}`>,
          c.readContract({
            address: escrowAddress,
            abi: KLEROS_ESC_ABI as Abi,
            functionName: 'klerosExtraDataPart2',
          }) as Promise<`0x${string}`>,
        ])
        const extraData = encodeKlerosExtraData(part1, part2)
        const cost = (await c.readContract({
          address: escrowAddress,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: 'klerosCourt',
        })) as `0x${string}`
        return (await c.readContract({
          address: cost,
          abi: (await import('@/lib/contracts')).KLEROS_COURT_ABI as Abi,
          functionName: 'arbitrationCost',
          args: [extraData],
        })) as bigint
      } catch (err) {
        console.warn('[useArbitrationCost] failed:', err)
        return null
      }
    },
  })
}

/**
 * Subscribe to a KlerosEsc clone's relevant dispute events. Used by the
 * detail viewer to refresh when a new ruling lands.
 *
 * Returns the latest event timestamp seen so consumers can decide whether to
 * re-read state.
 */
export function useEscrowEventWatcher(
  escrowAddress: `0x${string}` | undefined,
  onEvent?: (name: string, args: Record<string, unknown>) => void,
) {
  const publicClient = usePublicClient()
  useEffect(() => {
    if (!publicClient || !escrowAddress) return
    const c = publicClient
    let cancelled = false
    const handler = (logs: Array<{
      eventName?: string
      args?: Record<string, unknown>
    }>) => {
      if (cancelled) return
      for (const log of logs) {
        if (log.eventName && onEvent) onEvent(log.eventName, log.args ?? {})
      }
    }
    const unwatch = c.watchContractEvent({
      address: escrowAddress,
      abi: KLEROS_ESC_ABI as Abi,
      onLogs: handler,
      events: [
        'DisputeRaised',
        'RulingReceived',
        'RulingExecuted',
        'Finalized',
        'Evidence',
        'DisputeTimedOut',
      ],
    })
    return () => {
      cancelled = true
      unwatch()
    }
  }, [publicClient, escrowAddress, onEvent])
}