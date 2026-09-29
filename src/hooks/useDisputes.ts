import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useChainId, usePublicClient } from 'wagmi'
import type { Log } from 'viem'
import { getDisputeById, getDisputesByUser, getUserByWallet } from '@/lib/supabase'
import {
  KLEROS_COURT_ABI,
  KLEROS_ESC_ABI,
  KLEROS_ESC_EVENTS_ABI,
  KLEROS_ESCROW_FACTORY_ABI,
  KLEROS_ESCROW_FACTORY_ADDRESS,
  encodeKlerosExtraData,
  type KlerosEscStateValue,
} from '@/lib/contracts'
import type { Abi } from 'viem'
import { useWalletSession } from './useWalletSession'

// All disputes for the wallet. Gated on a live session — RLS denies
// unauthenticated reads and would silently return [].
export function useDisputes() {
  const { address } = useAccount()
  const { sessionWallet, hasSession } = useWalletSession()
  return useQuery({
    queryKey: ['disputes', 'by-wallet', address, sessionWallet],
    queryFn: async () => {
      const user = address ? await getUserByWallet(address) : null
      return user ? getDisputesByUser(user.id) : []
    },
    enabled: !!address && hasSession,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

/** Single dispute by primary UUID, used by the detail viewer. */
export function useDispute(id: string | undefined) {
  const { sessionWallet, hasSession } = useWalletSession()
  return useQuery({
    queryKey: ['dispute', id, sessionWallet],
    queryFn: () => getDisputeById(id as string),
    enabled: !!id && hasSession,
  })
}

/** Paginated read of the connected wallet's KlerosEsc clones (factory). */
export function useUserEscrows() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const chainId = useChainId()
  const factoryReady = !!KLEROS_ESCROW_FACTORY_ADDRESS

  return useQuery({
    queryKey: ['user-escrows', address, chainId, KLEROS_ESCROW_FACTORY_ADDRESS],
    enabled: !!address && !!publicClient && factoryReady,
    queryFn: async (): Promise<`0x${string}`[]> => {
      if (!address || !publicClient || !factoryReady) return []
      const c = publicClient
      const factory = {
        address: KLEROS_ESCROW_FACTORY_ADDRESS as `0x${string}`,
        abi: KLEROS_ESCROW_FACTORY_ABI as Abi,
      }
      // Two counts in one multicall, then one multicall for the addresses.
      const [buyerCount, sellerCount] = (await c.multicall({
        contracts: [
          { ...factory, functionName: 'escrowCountByBuyer', args: [address] },
          { ...factory, functionName: 'escrowCountBySeller', args: [address] },
        ],
        allowFailure: false,
      })) as [bigint, bigint]

      const indexCalls: Array<{ functionName: 'escrowByBuyer' | 'escrowBySeller'; index: bigint }> = []
      for (let i = 0n; i < buyerCount; i++) indexCalls.push({ functionName: 'escrowByBuyer', index: i })
      for (let i = 0n; i < sellerCount; i++) indexCalls.push({ functionName: 'escrowBySeller', index: i })

      // Cap the scan: an unbounded index list builds a multicall RPC providers
      // reject wholesale. Keep the newest (most likely to be disputed).
      const capped = indexCalls.length > 200 ? indexCalls.slice(-200) : indexCalls
      if (capped.length !== indexCalls.length) {
        console.warn(`[useUserEscrows] ${indexCalls.length} escrows > 200; reading newest 200`)
      }

      const addresses = (await c.multicall({
        contracts: capped.map((call) => ({ ...factory, functionName: call.functionName, args: [address, call.index] })),
        allowFailure: false,
      })) as readonly `0x${string}`[]

      // De-dupe (a user could be both buyer and seller on the same escrow).
      return Array.from(new Set(addresses))
    },
  })
}

interface EscrowState {
  token: `0x${string}`; buyer: `0x${string}`; seller: `0x${string}`; treasury: `0x${string}`
  klerosCourt: `0x${string}`; klerosExtraDataPart1: `0x${string}`; klerosExtraDataPart2: `0x${string}`
  gracePeriod: bigint; feeBps: bigint; tradeAmount: bigint
  securityDepositPct: bigint; securityDepositAmount: bigint
  state: KlerosEscStateValue
  buyerSecurityDeposited: boolean; sellerSecurityDeposited: boolean
  fundsLocked: boolean; disputeCreated: boolean
  klerosDisputeID: bigint; currentRuling: bigint; rulingReceivedTime: bigint; disputeTimestamp: bigint
  disputer: `0x${string}`
  evidenceGroupID: bigint; confirmationTime: bigint; buyerDepositTime: bigint; sellerDepositTime: bigint
  fundedAt: bigint
}

const ESCROW_FIELDS = [
  'token', 'buyer', 'seller', 'treasury', 'klerosCourt', 'klerosExtraDataPart1', 'klerosExtraDataPart2',
  'gracePeriod', 'feeBps', 'tradeAmount', 'securityDepositPct', 'securityDepositAmount', 'state',
  'buyerSecurityDeposited', 'sellerSecurityDeposited', 'fundsLocked', 'disputeCreated', 'klerosDisputeID',
  'currentRuling', 'rulingReceivedTime', 'disputeTimestamp', 'disputer', 'evidenceGroupID',
  'confirmationTime', 'buyerDepositTime', 'sellerDepositTime', 'fundedAt',
] as const

type PublicClient = NonNullable<ReturnType<typeof usePublicClient>>

const readEsc = <T,>(c: PublicClient, address: `0x${string}`, functionName: string) =>
  c.readContract({ address, abi: KLEROS_ESC_ABI as Abi, functionName }) as Promise<T>

const readCourt = <T,>(c: PublicClient, address: `0x${string}`, functionName: string, args: readonly unknown[]) =>
  c.readContract({ address, abi: KLEROS_COURT_ABI as Abi, functionName, args }) as Promise<T>

/** Live state of one KlerosEsc clone in a single multicall (polls every 15s). */
export function useEscrowState(escrowAddress: `0x${string}` | undefined) {
  const publicClient = usePublicClient()
  const chainId = useChainId()
  return useQuery({
    queryKey: ['escrow-state', escrowAddress, chainId],
    enabled: !!publicClient && !!escrowAddress,
    refetchInterval: 15_000,
    staleTime: 5_000,
    queryFn: async (): Promise<EscrowState | null> => {
      if (!publicClient || !escrowAddress) return null
      const results = (await publicClient.multicall({
        contracts: ESCROW_FIELDS.map((functionName) => ({ address: escrowAddress, abi: KLEROS_ESC_ABI as Abi, functionName })),
        allowFailure: false,
      })) as readonly unknown[]
      return Object.fromEntries(ESCROW_FIELDS.map((field, i) => [field, results[i]])) as unknown as EscrowState
    },
  })
}

/** Live KlerosCourt arbitration cost for raising a dispute (wei, or null). */
export function useArbitrationCost(escrowAddress: `0x${string}` | undefined) {
  const publicClient = usePublicClient()
  const chainId = useChainId()
  return useQuery({
    queryKey: ['arbitration-cost', escrowAddress, chainId],
    enabled: !!publicClient && !!escrowAddress,
    queryFn: async (): Promise<bigint | null> => {
      if (!publicClient || !escrowAddress) return null
      const c = publicClient
      try {
        const [part1, part2] = await Promise.all([
          readEsc<`0x${string}`>(c, escrowAddress, 'klerosExtraDataPart1'),
          readEsc<`0x${string}`>(c, escrowAddress, 'klerosExtraDataPart2'),
        ])
        const court = await readEsc<`0x${string}`>(c, escrowAddress, 'klerosCourt')
        return await readCourt<bigint>(c, court, 'arbitrationCost', [encodeKlerosExtraData(part1, part2)])
      } catch {
        return null
      }
    },
  })
}

// Appeal data (cost, status 0 Waiting/1 Appealable/2 Solved, appeal window).
// Polls; nulls on failure so the UI can disable the appeal button.
export function useAppealInfo(
  escrowAddress: `0x${string}` | undefined,
  klerosDisputeId: bigint | null | undefined,
) {
  const publicClient = usePublicClient()
  const chainId = useChainId()
  return useQuery({
    queryKey: ['appeal-info', escrowAddress, klerosDisputeId?.toString() ?? null, chainId],
    enabled: !!publicClient && !!escrowAddress && klerosDisputeId != null && klerosDisputeId > 0n,
    refetchInterval: 15_000,
    staleTime: 5_000,
    queryFn: async () => {
      if (!publicClient || !escrowAddress || klerosDisputeId == null || klerosDisputeId <= 0n) return null
      const c = publicClient
      try {
        const [court, part1, part2] = await Promise.all([
          readEsc<`0x${string}`>(c, escrowAddress, 'klerosCourt'),
          readEsc<`0x${string}`>(c, escrowAddress, 'klerosExtraDataPart1'),
          readEsc<`0x${string}`>(c, escrowAddress, 'klerosExtraDataPart2'),
        ])
        const extraData = encodeKlerosExtraData(part1, part2)
        const [appealCost, disputeStatus, [periodStart, periodEnd]] = await Promise.all([
          readCourt<bigint>(c, court, 'appealCost', [klerosDisputeId, extraData]),
          readCourt<bigint>(c, court, 'disputeStatus', [klerosDisputeId]),
          readCourt<readonly [bigint, bigint]>(c, court, 'appealPeriod', [klerosDisputeId]),
        ])
        const now = BigInt(Math.floor(Date.now() / 1000))
        return {
          appealCostWei: appealCost,
          klerosDisputeStatus: disputeStatus,
          periodStart,
          periodEnd,
          appealable: disputeStatus === 1n && now >= periodStart && now < periodEnd,
        }
      } catch {
        return null
      }
    },
  })
}

/** Subscribe to a KlerosEsc clone's events (used to refresh on rulings). */
export function useEscrowEventWatcher(
  escrowAddress: `0x${string}` | undefined,
  onEvent?: (name: string, args: Record<string, unknown>) => void,
) {
  const publicClient = usePublicClient()
  // Hold the callback in a ref so inline/changing callbacks don't resubscribe
  // the watcher on every render (which would miss events in the gap).
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  })
  useEffect(() => {
    if (!publicClient || !escrowAddress) return
    const c = publicClient
    let cancelled = false
    // wagmi v2 types `onLogs` strictly per declared `events`; widen at runtime
    // and dispatch by event name (a union `eventName` filter can't be typed).
    const handler = (logs: Log[]) => {
      if (cancelled) return
      const cb = onEventRef.current
      if (!cb) return
      // Serialize callbacks in log order: each is a fire-and-forget DB mirror,
      // and concurrent dispatch lets a later event's write commit before an
      // earlier one (e.g. "funded" landing before "seller_deposited").
      let chain: Promise<unknown> = Promise.resolve()
      for (const log of logs) {
        const eventName = (log as unknown as { eventName?: string }).eventName
        if (!eventName) continue
        const args = (log as unknown as { args?: Record<string, unknown> }).args ?? {}
        chain = chain.then(() => cb(eventName, args)).catch(() => {})
      }
    }
    const unwatch = c.watchContractEvent({
      address: escrowAddress,
      // Events-only ABI avoids bloating the filter set with read/write entries.
      abi: KLEROS_ESC_EVENTS_ABI as Abi,
      onLogs: handler as unknown as Parameters<typeof c.watchContractEvent>[0]['onLogs'],
    })
    return () => {
      cancelled = true
      unwatch()
    }
  }, [publicClient, escrowAddress])
}
