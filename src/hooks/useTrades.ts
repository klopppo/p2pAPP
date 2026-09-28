import { useQuery } from '@tanstack/react-query'
import { useAccount, useChainId, usePublicClient } from 'wagmi'
import type { Abi } from 'viem'
import { getTradesByUser, getUserByWallet } from '@/lib/supabase'
import { KLEROS_ESC_ABI, KlerosEscState } from '@/lib/contracts'
import { setCachedEscrowStatus } from '@/lib/escrowStatusCache'
import { useWalletSession } from './useWalletSession'

type EscrowStateValue = (typeof KlerosEscState)[keyof typeof KlerosEscState]

/**
 * Collapse the on-chain KlerosEsc state machine (+ funding flags) into the
 * `escrow_status` vocabulary the UI renders. The DB mirror can lag, so the list
 * reads the chain and lets this override the stored value.
 */
export function deriveEscrowStatus(
  state: number,
  buyerDeposited: boolean,
  sellerDeposited: boolean,
  fundsLocked: boolean,
  securityDepositPct: bigint,
): string {
  switch (state as EscrowStateValue) {
    case KlerosEscState.AWAITING_FUNDING:
      // Mirrors KlerosEsc._checkFullyFunded: at pct == 0 a lock alone funds the
      // escrow; otherwise both deposits AND the lock are required.
      if (securityDepositPct === 0n) {
        if (fundsLocked) return 'funded'
        if (sellerDeposited) return 'seller_deposited'
        return 'awaiting_deposit'
      }
      if (fundsLocked && buyerDeposited && sellerDeposited) return 'funded'
      if (buyerDeposited) return 'buyer_deposited'
      if (sellerDeposited) return 'seller_deposited'
      return 'awaiting_deposit'
    case KlerosEscState.FUNDED:
      return 'funded'
    case KlerosEscState.CONFIRMED_PENDING:
      return 'confirmed'
    case KlerosEscState.AWAITING_RULING:
    case KlerosEscState.RULING_RECEIVED:
    case KlerosEscState.RULING_EXECUTED:
      return 'disputed'
    case KlerosEscState.COMPLETED:
      return 'released'
    case KlerosEscState.CANCELLED:
      return 'cancelled'
    default:
      return 'awaiting_deposit'
  }
}

/**
 * All trades for the wallet, newest first, each enriched with
 * `live_escrow_status` read from the escrow contract. Gated on a live session
 * (RLS returns [] silently). `chainId` is in the key because a chain switch
 * changes which escrows we read.
 */
export function useTrades() {
  const { address } = useAccount()
  const { sessionWallet, hasSession } = useWalletSession()
  const publicClient = usePublicClient()
  const chainId = useChainId()
  return useQuery({
    queryKey: ['trades', 'by-wallet', address, sessionWallet, chainId],
    queryFn: async () => {
      const user = address ? await getUserByWallet(address) : null
      if (!user) return []
      const trades = await getTradesByUser(user.id)

      const withEscrow = trades.filter(
        (t) => typeof t.escrow_contract_addr === 'string' && t.escrow_contract_addr,
      )
      if (!publicClient || withEscrow.length === 0) return trades

      try {
        const contracts = withEscrow.flatMap((t) => {
          const addr = t.escrow_contract_addr as `0x${string}`
          return [
            { address: addr, abi: KLEROS_ESC_ABI as Abi, functionName: 'state' },
            { address: addr, abi: KLEROS_ESC_ABI as Abi, functionName: 'buyerSecurityDeposited' },
            { address: addr, abi: KLEROS_ESC_ABI as Abi, functionName: 'sellerSecurityDeposited' },
            { address: addr, abi: KLEROS_ESC_ABI as Abi, functionName: 'fundsLocked' },
            { address: addr, abi: KLEROS_ESC_ABI as Abi, functionName: 'securityDepositPct' },
          ]
        })
        const results = (await publicClient.multicall({
          contracts,
          allowFailure: true,
        })) as Array<{ status: 'success' | 'failure'; result?: unknown }>

        const liveByTradeId = new Map<string, string>()
        withEscrow.forEach((t, i) => {
          const base = i * 5
          const stateRes = results[base]
          if (!stateRes || stateRes.status !== 'success') return
          const derived = deriveEscrowStatus(
            Number(stateRes.result),
            !!results[base + 1]?.result,
            !!results[base + 2]?.result,
            !!results[base + 3]?.result,
            (results[base + 4]?.result as bigint | undefined) ?? 0n,
          )
          liveByTradeId.set(t.id, derived)
          // Persist last-known phase so reloads can show it instantly.
          setCachedEscrowStatus(t.escrow_contract_addr as string, derived)
        })

        return trades.map((t) => {
          const live = liveByTradeId.get(t.id)
          return live ? { ...t, live_escrow_status: live } : t
        })
      } catch (err) {
        console.warn('[useTrades] on-chain escrow status read failed:', err)
        return trades
      }
    },
    // Without a public client we'd cache DB-only (stale) rows.
    enabled: !!address && hasSession && !!publicClient,
    refetchInterval: 300_000,
    staleTime: 5_000,
  })
}
