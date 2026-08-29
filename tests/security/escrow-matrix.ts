// Escrow access-control matrix — the single source of truth for "who may call
// what" across KlerosEsc, KlerosEscrowFactory and KlerosCourt (views).
//
// Consumed by tests/security/escrow-access-control.spec.ts to verify the
// frontend ABI surface and client action gates honour the allow/deny rules,
// and rendered into docs/penetration-test-matrix.md for the human reader.
//
// `source` records how the rule is corroborated:
//   "contract-doc"  — stated by the project's contract docs (contract-execution-status.md,
//                     dispute-status.md, factory-admin-runbook.md) and/or the
//                     KlerosEsc NatSpec referenced from src/lib/contracts.ts.
//   "abi"           — derivable from the ABI + constants in src/lib/contracts.ts.
//   "client-gate"   — enforced by the frontend action gates (TradeDetailPage /
//                     DisputePage / DisputeDetailPage), which mirror the contract.
//   "unverified"    — repo here does not prove it; verify against the .sol source
//                     in `contrats/` before trusting. Flagged as an audit gap.

export type EscrowContract = "KlerosEsc" | "KlerosEscrowFactory" | "KlerosCourt"

/**
 * Who is ALLOWED to call a function. `either` = buyer or seller (not a third
 * party); `anyone` = permissionless (keeper pattern); `court` = the pinned
 * Kleros Court via ERC-792 callback; `owner` / `newTreasury` = factory owner /
 * pending-treasury acceptance.
 */
export type EscrowCaller =
  | "buyer"
  | "seller"
  | "either"
  | "anyone"
  | "court"
  | "owner"
  | "newTreasury"

export interface EscrowFnSpec {
  contract: EscrowContract
  fn: string
  /** ALLOWED callers. Every caller NOT listed here is DENIED. */
  caller: readonly EscrowCaller[]
  /** Human-readable state-machine constraint (mirrors the contract requires). */
  state: string
  payable: boolean
  source: "contract-doc" | "abi" | "client-gate" | "unverified"
  note?: string
}

export const ESCROW_FUNCTION_MATRIX: readonly EscrowFnSpec[] = [
  // ─── KlerosEsc: funding phase ──────────────────────────────────────────────
  {
    contract: "KlerosEsc",
    fn: "depositBuyerSecurityDeposit",
    caller: ["buyer"],
    state: "AWAITING_FUNDING",
    payable: false,
    source: "contract-doc",
    note: "buyer-only; shown by TradeDetailPage only when isBuyer && AWAITING_FUNDING",
  },
  {
    contract: "KlerosEsc",
    fn: "depositSellerSecurityDeposit",
    caller: ["seller"],
    state: "AWAITING_FUNDING",
    payable: false,
    source: "contract-doc",
    note: "seller-only; shown by TradeDetailPage only when isSeller && AWAITING_FUNDING",
  },
  {
    contract: "KlerosEsc",
    fn: "lockFunds",
    caller: ["seller"],
    state: "AWAITING_FUNDING, after buyer deposit",
    payable: false,
    source: "contract-doc",
    note: "seller-only; part of the seller path (deposit + lock in sequence)",
  },
  {
    contract: "KlerosEsc",
    fn: "confirm",
    caller: ["buyer"],
    state: "FUNDED",
    payable: false,
    source: "contract-doc",
    note: "buyer-only; shown by TradeDetailPage only when isBuyer && FUNDED",
  },
  {
    contract: "KlerosEsc",
    fn: "release",
    caller: ["anyone"],
    state: "CONFIRMED_PENDING, after confirmationTime + gracePeriod",
    payable: false,
    source: "contract-doc",
    note: "permissionless keeper call; this is the anti-stall escrow release. UI shows it in CONFIRMED_PENDING + grace elapsed.",
  },
  {
    contract: "KlerosEsc",
    fn: "cancelTrade",
    caller: ["either"],
    state: "AWAITING_FUNDING + 1-day timelock for the depositing party",
    payable: false,
    source: "contract-doc",
    note: "buyer cancel: buyerSecurityDeposited && !fundsLocked && now >= buyerDepositTime + 1d; seller cancel: sellerSecurityDeposited && !buyerSecurityDeposited && now >= sellerDepositTime + 1d",
  },

  // ─── KlerosEsc: dispute flow ───────────────────────────────────────────────
  {
    contract: "KlerosEsc",
    fn: "raiseDispute",
    caller: ["either"],
    state: "FUNDED or CONFIRMED_PENDING inside grace window",
    payable: true,
    source: "contract-doc",
    note: "carries arbitrationCostWei; reserved for the parties. Non-party call reverts on-chain (UI does not pre-block it — UX gap only).",
  },
  {
    contract: "KlerosEsc",
    fn: "submitEvidence",
    caller: ["either"],
    state: "AWAITING_RULING or RULING_RECEIVED (evidence group per round)",
    payable: false,
    source: "contract-doc",
    note: "ERC-1497; only the parties may attach evidence. UI gates on filerRole.",
  },
  {
    contract: "KlerosEsc",
    fn: "appeal",
    caller: ["either"],
    state: "disputeStatus = APPEALABLE(1) and within appealPeriod window",
    payable: true,
    source: "contract-doc",
    note: "forwards appealCostWei to Kleros Court. Kleros v1 appeal funding is stake-based; UI gates on appealable window.",
  },
  {
    contract: "KlerosEsc",
    fn: "rule",
    caller: ["court"],
    state: "onlyKleros callback during AWAITING_RULING",
    payable: false,
    source: "contract-doc",
    note: "ERC-792 arbitration callback; _ruling > NUMBER_OF_CHOICES reverts InvalidRuling. NOT callable by users.",
  },
  {
    contract: "KlerosEsc",
    fn: "executeRuling",
    caller: ["anyone"],
    state: "RULING_RECEIVED",
    payable: false,
    source: "contract-doc",
    note: "permissionless keeper pattern (B-7 dropped the isFiler gate).",
  },
  {
    contract: "KlerosEsc",
    fn: "finalize",
    caller: ["anyone"],
    state: "RULING_EXECUTED (appeal window exhausted)",
    payable: false,
    source: "contract-doc",
    note: "permissionless keeper pattern.",
  },
  {
    contract: "KlerosEsc",
    fn: "timeoutDispute",
    caller: ["anyone"],
    state:
      "AWAITING_RULING or RULING_RECEIVED and >= DISPUTE_TIMEOUT (30d) elapsed",
    payable: false,
    source: "contract-doc",
    note: "permissionless keeper pattern; unilateral loss for the disputer.",
  },

  // ─── KlerosEsc: views (anyone) ─────────────────────────────────────────────
  ...(
    [
      "token",
      "buyer",
      "seller",
      "treasury",
      "klerosCourt",
      "klerosExtraDataPart1",
      "klerosExtraDataPart2",
      "gracePeriod",
      "feeBps",
      "tradeAmount",
      "securityDepositPct",
      "securityDepositAmount",
      "state",
      "buyerSecurityDeposited",
      "sellerSecurityDeposited",
      "fundsLocked",
      "disputeCreated",
      "disputer",
      "disputeTimestamp",
      "klerosDisputeID",
      "currentRuling",
      "rulingReceivedTime",
      "evidenceGroupID",
      "confirmationTime",
      "buyerDepositTime",
      "sellerDepositTime",
    ] as const
  ).map(
    (fn): EscrowFnSpec => ({
      contract: "KlerosEsc",
      fn,
      caller: ["anyone"],
      state: "-",
      payable: false,
      source: "abi",
    })
  ),

  // ─── KlerosEscrowFactory: clone creation + listing (anyone) ───────────────
  {
    contract: "KlerosEscrowFactory",
    fn: "createEscrow",
    caller: ["anyone"],
    state: "-",
    payable: false,
    source: "contract-doc",
    note: "permissionless clone deploy; pins buyer/seller/grace/amount/bps + immutable klerosCourt/extraData/treasury/feeBps.",
  },
  ...(
    [
      "token",
      "klerosCourt",
      "klerosExtraDataPart1",
      "klerosExtraDataPart2",
      "feeBps",
      "treasury",
      "implementation",
      "owner",
      "pendingFeeBps",
      "feeChangePending",
      "pendingTreasury",
      "escrowCountByBuyer",
      "escrowCountBySeller",
      "escrowByBuyer",
      "escrowBySeller",
    ] as const
  ).map(
    (fn): EscrowFnSpec => ({
      contract: "KlerosEscrowFactory",
      fn,
      caller: ["anyone"],
      state: "-",
      payable: false,
      source: "abi",
    })
  ),

  // ─── KlerosEscrowFactory: owner / two-step administration ─────────────────
  {
    contract: "KlerosEscrowFactory",
    fn: "setPendingFee",
    caller: ["owner"],
    state: "feeBps <= MAX_FEE_BPS (10000)",
    payable: false,
    source: "contract-doc",
    note: "step 1 of the two-step fee change; 1-day gap before acceptFee.",
  },
  {
    contract: "KlerosEscrowFactory",
    fn: "acceptFee",
    caller: ["anyone"],
    state: ">= 1 day after setPendingFee",
    payable: false,
    source: "contract-doc",
    note: "step 2 is permissionless (keeper bot ideal).",
  },
  {
    contract: "KlerosEscrowFactory",
    fn: "setTreasury",
    caller: ["owner"],
    state: "non-zero address",
    payable: false,
    source: "contract-doc",
    note: "step 1; previous treasury keeps control until step 2.",
  },
  {
    contract: "KlerosEscrowFactory",
    fn: "acceptTreasury",
    caller: ["newTreasury"],
    state: "caller == pendingTreasury",
    payable: false,
    source: "contract-doc",
    note: "only the proposed treasury can accept — prevents takeover by third parties or the old owner.",
  },

  // ─── KlerosCourt: read-only interface (anyone) ─────────────────────────────
  ...(
    [
      "arbitrationCost",
      "appealCost",
      "appealPeriod",
      "disputeStatus",
      "currentRuling",
    ] as const
  ).map(
    (fn): EscrowFnSpec => ({
      contract: "KlerosCourt",
      fn,
      caller: ["anyone"],
      state: "-",
      payable: false,
      source: "abi",
      note: "view-only; fee/cost estimation and ruling reads.",
    })
  ),
]

// ─── Derived views for fast lookup ───────────────────────────────────────────

export const matrixByContract = (contract: EscrowContract) =>
  ESCROW_FUNCTION_MATRIX.filter((s) => s.contract === contract)

export const matrixFnName = (fn: string): EscrowFnSpec | undefined =>
  ESCROW_FUNCTION_MATRIX.find((s) => s.fn === fn)

/** Callers DENIED for a function = every caller type that is not listed. */
export const ALL_CALLER_TYPES: readonly EscrowCaller[] = [
  "buyer",
  "seller",
  "either",
  "anyone",
  "court",
  "owner",
  "newTreasury",
]

export function deniedCallers(spec: EscrowFnSpec): readonly EscrowCaller[] {
  if (spec.caller.includes("anyone")) return []
  return ALL_CALLER_TYPES.filter((c) => !spec.caller.includes(c))
}

/** Mutating (state-changing) functions of each contract, per the matrix. */
export const MUTATING_FN_NAMES = new Set(
  ESCROW_FUNCTION_MATRIX.filter((s) => s.source !== "abi").map((s) => s.fn)
)
