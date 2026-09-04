import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import type { Log } from 'viem'
import {
  getDisputeById,
  getDisputesByUser,
  getUserByWallet,
} from '@/lib/supabase'
import {
  KLEROS_COURT_ABI,
  KLEROS_ESC_ABI,
  KLEROS_ESCROW_FACTORY_ABI,
  KLEROS_ESCROW_FACTORY_ADDRESS,
  encodeKlerosExtraData,
  type KlerosEscStateValue,
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
      const user = address ? await getUserByWallet(address) : null
      if (!user) return []
      return getDisputesByUser(user.id)
    },
    enabled: !!address,
    // Surface status flips (in_review → escalated → resolved) without forcing
    // a manual refresh. Cheap because the table is small and the query is
    // filtered by user_id via PostgREST.
    refetchInterval: 30_000,
    staleTime: 15_000,
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
      // Two reads for the counts (one multicall round-trip instead of two
      // serialized calls), then a second multicall for every clone address.
      // The previous loop issued one RPC per escrow — sequential waterfall
      // that grew with trade history.
      const [buyerCount, sellerCount] = (await c.multicall({
        contracts: [
          {
            address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
            abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
            functionName: 'escrowCountByBuyer',
            args: [address],
          },
          {
            address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
            abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
            functionName: 'escrowCountBySeller',
            args: [address],
          },
        ],
        allowFailure: false,
      })) as [bigint, bigint]

      const indexCalls: Array<{
        functionName: 'escrowByBuyer' | 'escrowBySeller'
        index: bigint
      }> = []
      for (let i = 0n; i < buyerCount; i++) {
        indexCalls.push({ functionName: 'escrowByBuyer', index: i })
      }
      for (let i = 0n; i < sellerCount; i++) {
        indexCalls.push({ functionName: 'escrowBySeller', index: i })
      }
      const addresses = (await c.multicall({
        contracts: indexCalls.map((call) => ({
          address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
          abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
          functionName: call.functionName,
          args: [address, call.index],
        })),
        allowFailure: false,
      })) as readonly `0x${string}`[]

      // De-dupe (a user could be both buyer and seller on the same escrow).
      return Array.from(new Set(addresses))
    },
  })
}

/**
 * Read the live state of a single KlerosEsc clone (state machine + identity +
 * dispute metadata). One viem multicall round-trip regardless of how many
 * fields the page consumes.
 */
export function useEscrowState(escrowAddress: `0x${string}` | undefined) {
  const publicClient = usePublicClient()
  return useQuery({
    queryKey: ['escrow-state', escrowAddress],
    enabled: !!publicClient && !!escrowAddress,
    queryFn: async () => {
      if (!publicClient || !escrowAddress) return null
      const c = publicClient
      const contracts = [
        { functionName: 'token', args: [] as const },
        { functionName: 'buyer', args: [] as const },
        { functionName: 'seller', args: [] as const },
        { functionName: 'treasury', args: [] as const },
        { functionName: 'klerosCourt', args: [] as const },
        { functionName: 'klerosExtraDataPart1', args: [] as const },
        { functionName: 'klerosExtraDataPart2', args: [] as const },
        { functionName: 'gracePeriod', args: [] as const },
        { functionName: 'feeBps', args: [] as const },
        { functionName: 'tradeAmount', args: [] as const },
        { functionName: 'securityDepositPct', args: [] as const },
        { functionName: 'securityDepositAmount', args: [] as const },
        { functionName: 'state', args: [] as const },
        { functionName: 'buyerSecurityDeposited', args: [] as const },
        { functionName: 'sellerSecurityDeposited', args: [] as const },
        { functionName: 'fundsLocked', args: [] as const },
        { functionName: 'disputeCreated', args: [] as const },
        { functionName: 'klerosDisputeID', args: [] as const },
        { functionName: 'currentRuling', args: [] as const },
        { functionName: 'rulingReceivedTime', args: [] as const },
        { functionName: 'disputeTimestamp', args: [] as const },
        { functionName: 'disputer', args: [] as const },
        { functionName: 'evidenceGroupID', args: [] as const },
        { functionName: 'confirmationTime', args: [] as const },
        { functionName: 'buyerDepositTime', args: [] as const },
        { functionName: 'sellerDepositTime', args: [] as const },
      ] as const

      type Tuple = readonly unknown[]
      const results = (await c.multicall({
        contracts: contracts.map((x) => ({
          address: escrowAddress,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: x.functionName,
          args: x.args as Tuple,
        })),
        allowFailure: false,
      })) as readonly unknown[]

      const [
        token,
        buyer,
        seller,
        treasury,
        klerosCourt,
        klerosExtraDataPart1,
        klerosExtraDataPart2,
        gracePeriod,
        feeBps,
        tradeAmount,
        securityDepositPct,
        securityDepositAmount,
        state,
        buyerSecurityDeposited,
        sellerSecurityDeposited,
        fundsLocked,
        disputeCreated,
        klerosDisputeID,
        currentRuling,
        rulingReceivedTime,
        disputeTimestamp,
        disputer,
        evidenceGroupID,
        confirmationTime,
        buyerDepositTime,
        sellerDepositTime,
      ] = results

      return {
        token: token as `0x${string}`,
        buyer: buyer as `0x${string}`,
        seller: seller as `0x${string}`,
        treasury: treasury as `0x${string}`,
        klerosCourt: klerosCourt as `0x${string}`,
        klerosExtraDataPart1: klerosExtraDataPart1 as `0x${string}`,
        klerosExtraDataPart2: klerosExtraDataPart2 as `0x${string}`,
        gracePeriod: gracePeriod as bigint,
        feeBps: feeBps as bigint,
        tradeAmount: tradeAmount as bigint,
        securityDepositPct: securityDepositPct as bigint,
        securityDepositAmount: securityDepositAmount as bigint,
        state: state as KlerosEscStateValue,
        buyerSecurityDeposited: buyerSecurityDeposited as boolean,
        sellerSecurityDeposited: sellerSecurityDeposited as boolean,
        fundsLocked: fundsLocked as boolean,
        disputeCreated: disputeCreated as boolean,
        klerosDisputeID: klerosDisputeID as bigint,
        currentRuling: currentRuling as bigint,
        rulingReceivedTime: rulingReceivedTime as bigint,
        disputeTimestamp: disputeTimestamp as bigint,
        disputer: disputer as `0x${string}`,
        evidenceGroupID: evidenceGroupID as bigint,
        confirmationTime: confirmationTime as bigint,
        buyerDepositTime: buyerDepositTime as bigint,
        sellerDepositTime: sellerDepositTime as bigint,
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
          abi: KLEROS_COURT_ABI as Abi,
          functionName: 'arbitrationCost',
          args: [extraData],
        })) as bigint
      } catch (_err) {
        return null
      }
    },
  })
}

/**
 * Appeal data for a single dispute: ETH cost to fund an appeal, current
 * KlerosCourt.DisputeStatus (0 Waiting, 1 Appealable, 2 Solved), and the
 * appeal window (start/end unix seconds). Returns nulls on read failure so
 * the UI can disable the appeal button gracefully.
 */
export function useAppealInfo(
  escrowAddress: `0x${string}` | undefined,
  klerosDisputeId: bigint | null | undefined,
) {
  const publicClient = usePublicClient()
  return useQuery({
    queryKey: ['appeal-info', escrowAddress, klerosDisputeId?.toString() ?? null],
    enabled: !!publicClient && !!escrowAddress && klerosDisputeId != null && klerosDisputeId > 0n,
    // Poll the appeal window + status while the dispute is in flight so the
    // countdown updates without a manual refresh; Kleros status transitions
    // (Waiting → Appealable → Solved) are otherwise missed.
    refetchInterval: 15_000,
    staleTime: 5_000,
    queryFn: async () => {
      if (!publicClient || !escrowAddress || klerosDisputeId == null || klerosDisputeId <= 0n) {
        return null
      }
      const c = publicClient
      try {
        const [courtAddr, part1, part2] = await Promise.all([
          c.readContract({
            address: escrowAddress,
            abi: KLEROS_ESC_ABI as Abi,
            functionName: 'klerosCourt',
          }) as Promise<`0x${string}`>,
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
        const [appealCost, disputeStatus, [periodStart, periodEnd]] = await Promise.all([
          c.readContract({
            address: courtAddr,
            abi: KLEROS_COURT_ABI as Abi,
            functionName: 'appealCost',
            args: [klerosDisputeId, extraData],
          }) as Promise<bigint>,
          c.readContract({
            address: courtAddr,
            abi: KLEROS_COURT_ABI as Abi,
            functionName: 'disputeStatus',
            args: [klerosDisputeId],
          }) as Promise<bigint>,
          c.readContract({
            address: courtAddr,
            abi: KLEROS_COURT_ABI as Abi,
            functionName: 'appealPeriod',
            args: [klerosDisputeId],
          }) as Promise<readonly [bigint, bigint]>,
        ])
        const now = BigInt(Math.floor(Date.now() / 1000))
        const inWindow = now >= periodStart && now < periodEnd
        return {
          appealCostWei: appealCost,
          klerosDisputeStatus: disputeStatus,
          periodStart,
          periodEnd,
          appealable: disputeStatus === 1n && inWindow,
        }
      } catch (_err) {
        return null
      }
    },
  })
}

/**
 * Subscribe to a KlerosEsc clone's relevant dispute events. Used by the
 * detail viewer to refresh when a new ruling lands.
 */
export function useEscrowEventWatcher(
  escrowAddress: `0x${string}` | undefined,
  onEvent?: (name: string, args: Record<string, unknown>) => void,
) {
  const publicClient = usePublicClient()
  useEffect(() => {
    if (!publicClient || !escrowAddress || !onEvent) return
    const c = publicClient
    let cancelled = false
    // wagmi v2 types `onLogs` strictly per declared `events`; for our union
    // of event names we widen with a runtime duck-type check.
    const handler = (logs: Log[]) => {
      if (cancelled) return
      for (const log of logs) {
        const eventName = (log as unknown as { eventName?: string }).eventName
        if (eventName) {
          const args = (log as unknown as { args?: Record<string, unknown> })
            .args ?? {}
          onEvent(eventName, args)
        }
      }
    }
    const unwatch = c.watchContractEvent({
      address: escrowAddress,
      abi: KLEROS_ESC_ABI as Abi,
      onLogs: handler as unknown as Parameters<
        typeof c.watchContractEvent
      >[0]['onLogs'],
      // No `eventName` filter — wagmi v2's strict types don't accept a union
      // here, so we subscribe to every event on the contract and dispatch
      // by name in the handler.
    })
    return () => {
      cancelled = true
      unwatch()
    }
  }, [publicClient, escrowAddress, onEvent])
}