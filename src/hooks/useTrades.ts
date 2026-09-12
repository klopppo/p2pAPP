import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import type { Abi } from 'viem'
import { getTradesByUser, getUserByWallet } from '@/lib/supabase'
import { KLEROS_ESC_ABI, KlerosEscState } from '@/lib/contracts'
import { useWalletSession } from './useWalletSession'

type EscrowStateValue = (typeof KlerosEscState)[keyof typeof KlerosEscState]

/**
 * Collapse the on-chain KlerosEsc state machine (plus the funding flags) into
 * the `escrow_status` vocabulary the UI already renders. The DB mirror can
 * lag (or fail if the SECURITY DEFINER RPC isn't deployed), so the list reads
 * the chain and lets this override the stored value.
 */
export function deriveEscrowStatus(
  state: number,
  buyerDeposited: boolean,
  sellerDeposited: boolean,
  fundsLocked: boolean,
): string {
  switch (state as EscrowStateValue) {
    case KlerosEscState.AWAITING_FUNDING:
      if (fundsLocked || (buyerDeposited && sellerDeposited)) return 'funded'
      if (buyerDeposited) return 'buyer_deposited'
      if (sellerDeposited) return 'seller_deposited'
      return 'awaiting_deposit'
    case KlerosEscState.FUNDED:
      return 'funded'
    case KlerosEscState.CONFIRMED_PENDING:
      // Buyer confirmed, release window open — this is the "grace period".
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
 * All trades where the connected wallet is buyer or seller, newest first.
 *
 * Gated on a live Supabase session, not just a wallet: `trades_select_parties`
 * authorizes off the JWT claim, so an unauthenticated read would return `[]`
 * with no error (the "connected but empty" failure mode). The session wallet is
 * in the key so completing SIWE / switching wallets refetches.
 *
 * Each row is enriched with `live_escrow_status` (read straight from the
 * escrow contract) so the list shows the true phase even when the DB mirror is
 * stale. Falls back to the stored `escrow_status` when the read fails.
 */
export function useTrades() {
  const { address } = useAccount()
  const { sessionWallet, hasSession } = useWalletSession()
  const publicClient = usePublicClient()
  return useQuery({
    queryKey: ['trades', 'by-wallet', address, sessionWallet],
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
          ]
        })
        const results = (await publicClient.multicall({
          contracts,
          allowFailure: true,
        })) as Array<{ status: 'success' | 'failure'; result?: unknown }>

        const liveByTradeId = new Map<string, string>()
        withEscrow.forEach((t, i) => {
          const base = i * 4
          const stateRes = results[base]
          if (!stateRes || stateRes.status !== 'success') return
          const buyerDep = results[base + 1]?.result as boolean | undefined
          const sellerDep = results[base + 2]?.result as boolean | undefined
          const locked = results[base + 3]?.result as boolean | undefined
          liveByTradeId.set(
            t.id,
            deriveEscrowStatus(
              Number(stateRes.result),
              !!buyerDep,
              !!sellerDep,
              !!locked,
            ),
          )
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
    enabled: !!address && hasSession,
    // Background poll every 5 minutes. The DB mirror can lag and the list has
    // no realtime subscription, but the on-chain-derived phase is also
    // re-checked on mount / window focus, and the last snapshot is persisted,
    // so 5 minutes is just a safety net.
    refetchInterval: 300_000,
    staleTime: 5_000,
  })
}
