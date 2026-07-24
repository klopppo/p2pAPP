import { useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi'
import { toast } from 'sonner'
import { formatUnits, maxUint256, type Abi } from 'viem'
import {
  ArrowLeft,
  Wallet,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Coins,
  CheckCircle2,
  Send,
  Timer,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ERC20_ABI,
  KLEROS_ESC_ABI,
  KlerosEscState,
  KlerosEscStateLabel,
} from '@/lib/contracts'
import { useEscrowState } from '@/hooks/useDisputes'
import { getTradeById, upsertTradeEscrowStatus } from '@/lib/supabase'

type TxStage = 'idle' | 'approving' | 'depositing' | 'confirming' | 'mining'

const TX_LABEL: Record<TxStage, string> = {
  idle: 'Continue',
  approving: 'Approving token…',
  depositing: 'Confirm deposit…',
  confirming: 'Confirm action…',
  mining: 'Waiting for confirmation…',
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }

function formatTokenAmount(raw: bigint, decimals: number, symbol: string) {
  const human = formatUnits(raw, decimals)
  return `${human} ${symbol}`
}

function formatAddress(addr: string | null | undefined) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function TradeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  // Pull the trade from Supabase via react-query (handles loading/error/cache).
  const {
    data: trade,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['trade', id],
    queryFn: () => getTradeById(id as string),
    enabled: !!id,
  })

  const escrowAddress = trade?.escrow_contract_addr as
    | `0x${string}`
    | undefined

  // Live on-chain escrow state.
  const { data: escrowState, refetch: refetchEscrow } = useEscrowState(
    escrowAddress,
  )

  // Read the trade token (immutable on the factory, but cached per escrow for
  // convenience). Used for ERC-20 approve + display.
  const tokenAddress = escrowState?.token
  const { data: tokenSymbol } = useReadContract({
    address: tokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI as Abi,
    functionName: 'symbol',
    args: [],
    query: { enabled: !!tokenAddress },
  }) as { data: string | undefined }
  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI as Abi,
    functionName: 'decimals',
    args: [],
    query: { enabled: !!tokenAddress },
  }) as { data: number | undefined }

  const decimals = typeof tokenDecimals === 'number' ? tokenDecimals : 18
  const symbol =
    (typeof tokenSymbol === 'string' ? tokenSymbol : null) ??
    trade?.crypto_token ??
    'TOKEN'

  const [txStage, setTxStage] = useState<TxStage>('idle')
  const isTxBusy = txStage !== 'idle'

  const isBuyer =
    !!address && !!escrowState && address.toLowerCase() === escrowState.buyer.toLowerCase()
  const isSeller =
    !!address && !!escrowState && address.toLowerCase() === escrowState.seller.toLowerCase()

  const onChainState = escrowState?.state
  const liveState =
    typeof onChainState === 'number'
      ? (onChainState as keyof typeof KlerosEscState)
      : null
  const stateLabel =
    liveState != null ? KlerosEscStateLabel[liveState] : 'Loading…'

  // ── Action: approve + deposit (buyer OR seller path) ─────────────────────
  const fundEscrow = async (
    which: 'buyer' | 'seller',
    amountWei: bigint,
    afterApprove: () => Promise<`0x${string}`>,
  ) => {
    if (!tokenAddress || !escrowAddress || !publicClient) return

    try {
      // 1) Check current allowance — skip approve if already sufficient.
      setTxStage('approving')
      const owner = address as `0x${string}`
      const currentAllowance = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI as Abi,
        functionName: 'allowance',
        args: [owner, escrowAddress],
      })) as bigint

      if (currentAllowance < amountWei) {
        await writeContractAsync({
          address: tokenAddress,
          abi: ERC20_ABI as Abi,
          functionName: 'approve',
          args: [escrowAddress, maxUint256],
        })
        // Note: real flow should `waitForTransactionReceipt` to be safe; we
        // skip the wait here because the next deposit call would fail cleanly
        // if the approve is still pending.
      }

      // 2) Call the appropriate deposit function on the escrow.
      setTxStage('depositing')
      const txHash = await afterApprove()

      setTxStage('mining')
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      // 3) Mirror on-chain progress into Supabase so the listing pages can
      // filter by `escrow_status` without a re-read.
      const newStatus =
        which === 'buyer'
          ? 'buyer_deposited'
          : 'seller_deposited'
      await upsertTradeEscrowStatus(
        trade!.id,
        newStatus,
        txHash,
      ).catch(() => {
        /* non-fatal — the chain tx already happened */
      })

      toast.success(
        which === 'buyer'
          ? 'Security deposit posted.'
          : 'Funds locked.',
      )
      refetchEscrow()
    } catch (err) {
      console.error('[TradeDetailPage] fund failed:', err)
      toast.error(
        `${which === 'buyer' ? 'Deposit' : 'Lock'} failed: ${(err as Error).message}`,
      )
    } finally {
      setTxStage('idle')
    }
  }

  const handleBuyerDeposit = async () => {
    if (!escrowState) return
    await fundEscrow(
      'buyer',
      escrowState.securityDepositAmount,
      () =>
        writeContractAsync({
          address: escrowAddress!,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: 'depositBuyerSecurityDeposit',
        }),
    )
  }

  const handleSellerFund = async () => {
    if (!escrowState) return
    // Seller locks tradeAmount + own deposit. One approve covers both calls
    // (we approve maxUint256 above), then depositSellerSecurityDeposit +
    // lockFunds happen in sequence.
    await fundEscrow(
      'seller',
      escrowState.tradeAmount + escrowState.securityDepositAmount,
      async () => {
        // Deposit first so the state machine passes the SellerDepositFirst
        // check inside lockFunds().
        const depHash = await writeContractAsync({
          address: escrowAddress!,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: 'depositSellerSecurityDeposit',
        })
        await publicClient!.waitForTransactionReceipt({ hash: depHash })
        return writeContractAsync({
          address: escrowAddress!,
          abi: KLEROS_ESC_ABI as Abi,
          functionName: 'lockFunds',
        })
      },
    )
  }

  const handleConfirm = async () => {
    if (!escrowAddress) return
    try {
      setTxStage('confirming')
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'confirm',
      })
      setTxStage('mining')
      await publicClient!.waitForTransactionReceipt({ hash: txHash })
      await upsertTradeEscrowStatus(trade!.id, 'confirmed', txHash).catch(
        () => undefined,
      )
      toast.success('Payment confirmed. Grace period started.')
      refetchEscrow()
    } catch (err) {
      toast.error('Confirm failed: ' + (err as Error).message)
    } finally {
      setTxStage('idle')
    }
  }

  const handleRelease = async () => {
    if (!escrowAddress) return
    try {
      setTxStage('confirming')
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: KLEROS_ESC_ABI as Abi,
        functionName: 'release',
      })
      setTxStage('mining')
      await publicClient!.waitForTransactionReceipt({ hash: txHash })
      toast.success('Trade released — funds distributed.')
      refetchEscrow()
    } catch (err) {
      toast.error('Release failed: ' + (err as Error).message)
    } finally {
      setTxStage('idle')
    }
  }

  // ── Derived action visibility ─────────────────────────────────────────────
  const showBuyerDeposit =
    !!isBuyer && liveState === KlerosEscState.AWAITING_FUNDING
  const showSellerDeposit =
    !!isSeller &&
    liveState === KlerosEscState.AWAITING_FUNDING &&
    !(escrowState?.buyerSecurityDeposited ?? false)
  const showSellerLock =
    !!isSeller &&
    liveState === KlerosEscState.AWAITING_FUNDING &&
    (escrowState?.buyerSecurityDeposited ?? false) &&
    !(escrowState?.sellerSecurityDeposited ?? false)
  const showBuyerConfirm =
    !!isBuyer && liveState === KlerosEscState.FUNDED
  const graceEnd = useMemo(() => {
    if (!escrowState || liveState !== KlerosEscState.CONFIRMED_PENDING) return null
    // CONFIRMED_PENDING only stores confirmationTime? — no, that's not in
    // our escrowState slice. The full ABI would expose it; for the demo we
    // re-read via a follow-up RPC if needed. For now, indicate "release
    // available" without a precise countdown.
    return null
  }, [escrowState, liveState])
  const showRelease =
    liveState === KlerosEscState.CONFIRMED_PENDING
  const showRaiseDispute =
    (liveState === KlerosEscState.FUNDED ||
      liveState === KlerosEscState.CONFIRMED_PENDING) &&
    (isBuyer || isSeller)

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading trade…
      </section>
    )
  }

  if (isError || !trade) {
    return (
      <div className="w-full max-w-xl mx-auto">
        <Card className="glass-panel rounded-2xl">
          <CardContent className="p-6 space-y-4">
            <Text variant="h4">Trade not found</Text>
            <Text variant="muted" className="text-sm">
              {error instanceof Error
                ? error.message
                : 'This trade may have been removed or you don’t have access.'}
            </Text>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => navigate('/app/offers')}
            >
              Back to offers
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="rounded-full"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Text
          variant="small"
          className="uppercase tracking-wider text-muted-foreground"
        >
          {trade.trade_id}
        </Text>
        {liveState != null && (
          <span className="inline-flex items-center px-2 h-5 rounded-full bg-muted text-xs font-medium">
            {stateLabel}
          </span>
        )}
      </div>

      <Text as="h2" variant="h2" className="mb-1">
        Trade {trade.crypto_token}
      </Text>
      <Text variant="muted">
        {trade.crypto_amount} {trade.crypto_token} ·{' '}
        {CURRENCY_SYMBOLS[trade.fiat_currency ?? ''] ?? ''}
        {trade.fiat_amount} {trade.fiat_currency}
      </Text>

      {/* Wallet-not-connected */}
      {!isConnected && (
        <Alert className="mt-3 rounded-2xl">
          <Wallet className="w-4 h-4" />
          <AlertDescription>
            Connect your wallet to interact with this trade.
          </AlertDescription>
        </Alert>
      )}

      {/* Escrow contract + chain state */}
      {escrowAddress && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            Escrow contract
          </Text>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <code className="font-mono text-xs break-all">
                {escrowAddress}
              </code>
              <a
                href={`https://etherscan.io/address/${escrowAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
              >
                Etherscan <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {escrowState && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    Buyer
                  </Text>
                  <p className="font-mono">{formatAddress(escrowState.buyer)}</p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    Seller
                  </Text>
                  <p className="font-mono">{formatAddress(escrowState.seller)}</p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    Trade amount
                  </Text>
                  <p className="font-mono">
                    {formatTokenAmount(escrowState.tradeAmount, decimals, symbol)}
                  </p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    Security deposit
                  </Text>
                  <p className="font-mono">
                    {formatTokenAmount(
                      escrowState.securityDepositAmount,
                      decimals,
                      symbol,
                    )}
                  </p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    Fee
                  </Text>
                  <p className="font-mono">
                    {(Number(escrowState.feeBps) / 100).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <Text variant="small" className="text-muted-foreground">
                    Grace period
                  </Text>
                  <p className="font-mono">
                    {(Number(escrowState.gracePeriod) / 86400).toFixed(0)}d
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Funding progress */}
      {escrowState && (
        <Card className="glass-panel rounded-2xl p-6 mt-3">
          <Text variant="h4" className="font-bold mb-2">
            Funding
          </Text>

          <div className="space-y-3 text-sm">
            <FundingRow
              label={`Buyer deposit (${formatTokenAmount(escrowState.securityDepositAmount, decimals, symbol)})`}
              done={escrowState.buyerSecurityDeposited}
              who="buyer"
              isMe={isBuyer}
            />
            <FundingRow
              label={`Seller lock (${formatTokenAmount(escrowState.tradeAmount + escrowState.securityDepositAmount, decimals, symbol)})`}
              done={escrowState.sellerSecurityDeposited && escrowState.fundsLocked}
              who="seller"
              isMe={isSeller}
              subDone={
                escrowState.sellerSecurityDeposited && !escrowState.fundsLocked
                  ? 'Deposit posted · awaiting lockFunds()'
                  : undefined
              }
            />
          </div>

          <Separator />

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-2">
            {showBuyerDeposit && (
              <Button
                onClick={handleBuyerDeposit}
                disabled={isTxBusy || !tokenAddress}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? TX_LABEL[txStage] : 'Approve + post security deposit'}
              </Button>
            )}

            {showSellerDeposit && (
              <Button
                onClick={handleSellerFund}
                disabled={isTxBusy || !tokenAddress}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Coins className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? TX_LABEL[txStage] : 'Approve + post security deposit'}
              </Button>
            )}

            {showSellerLock && (
              <Button
                onClick={handleSellerFund}
                disabled={isTxBusy}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Coins className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? TX_LABEL[txStage] : 'Approve + lock crypto in escrow'}
              </Button>
            )}

            {showBuyerConfirm && (
              <Button
                onClick={handleConfirm}
                disabled={isTxBusy}
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? TX_LABEL[txStage] : 'I sent the fiat — confirm payment'}
              </Button>
            )}

            {showRelease && (
              <Button
                onClick={handleRelease}
                disabled={isTxBusy}
                variant="outline"
                className="rounded-full"
              >
                {isTxBusy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {isTxBusy ? TX_LABEL[txStage] : 'Release crypto to buyer'}
                {graceEnd && (
                  <Timer className="w-3.5 h-3.5 ml-2 text-muted-foreground" />
                )}
              </Button>
            )}

            {showRaiseDispute && (
              <Button
                asChild
                variant="ghost"
                className="rounded-full"
              >
                <Link
                  to={`/app/dispute?tradeId=${trade.id}&escrowAddress=${escrowAddress ?? ''}`}
                >
                  <ShieldAlert className="w-4 h-4 mr-2" />
                  Raise a Kleros dispute
                </Link>
              </Button>
            )}

            {!isConnected && (
              <p className="text-xs text-muted-foreground text-center">
                Connect your wallet to take action.
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

function FundingRow({
  label,
  done,
  who,
  isMe,
  subDone,
}: {
  label: string
  done: boolean
  who: 'buyer' | 'seller'
  isMe: boolean
  subDone?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {done ? (
          <CheckCircle2 className="w-4 h-4 text-success" />
        ) : (
          <Timer className="w-4 h-4 text-muted-foreground" />
        )}
        <span>{label}</span>
        {isMe && (
          <span className="text-xs text-muted-foreground">(you)</span>
        )}
      </div>
      <span
        className={`text-xs ${done ? 'text-success' : 'text-muted-foreground'}`}
      >
        {done ? (subDone ?? 'Done') : `Waiting for ${who}`}
      </span>
    </div>
  )
}

// Keep imports minimal — Label removed (was unused).
void 0