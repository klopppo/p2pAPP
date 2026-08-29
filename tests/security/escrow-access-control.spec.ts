// Escrow + factory + court ACCESS-CONTROL penetration checks.
//
// Verifies the in-repo authorization surface (src/lib/contracts.ts ABIs +
// enums + constants, and the client action gates) honours the allow/deny
// matrix in escrow-matrix.ts:
//
//   ALLOW  — callers that must be able to reach a function (matrix .caller)
//   DENY   — every caller type not listed (matrix derived via deniedCallers)
//
// The actual Solidity source lives in the separate `contrats/` workspace (not
// in this repo); those rules are captured here from the project's contract
// docs and the ABI comments. See docs/penetration-test-matrix.md.
//
// Any drift — a phantom ABI entry (the old unlockAfterTimeout made it here
// once), a role gate dropped in a page, a constant out of line with the
// contract — fails these tests.

import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  CANCEL_TIMELOCK_SECONDS,
  DEFAULT_GRACE_PERIOD_SECONDS,
  DEFAULT_SECURITY_DEPOSIT_BPS,
  DISPUTE_TIMEOUT_SECONDS,
  ERC20_ABI,
  KLEROS_COURT_ABI,
  KLEROS_COURT_MAINNET,
  KLEROS_DISPUTE_STATUS,
  KLEROS_ESC_ABI,
  KLEROS_ESC_EVENTS_ABI,
  KLEROS_ESCROW_FACTORY_ABI,
  KlerosEscState,
  MAX_GRACE_PERIOD_SECONDS,
  MAX_SECURITY_DEPOSIT_BPS,
  MIN_SECURITY_DEPOSIT_BPS,
  NUMBER_OF_CHOICES,
  Ruling,
  SEVERITY_TO_APPLEVEL,
} from "@/lib/contracts"
import {
  ESCROW_FUNCTION_MATRIX,
  MUTATING_FN_NAMES,
  matrixByContract,
} from "./escrow-matrix"

// ─── helpers ─────────────────────────────────────────────────────────────────

type AbiEntry = {
  type?: string
  name?: string
  stateMutability?: string
}

const fnNames = (abi: readonly AbiEntry[]): string[] =>
  abi.filter((e) => e.type === "function").map((e) => e.name ?? "")

const mutatingFnNames = (abi: readonly AbiEntry[]): string[] =>
  abi
    .filter(
      (e) =>
        e.type === "function" &&
        e.stateMutability !== "view" &&
        e.stateMutability !== "pure"
    )
    .map((e) => e.name ?? "")

const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8")

/** Text of `const x = ...` up to (but excluding) the next top-level const. */
const sliceUntilNextConst = (text: string, fromKeyword: string): string => {
  const start = text.indexOf(fromKeyword)
  if (start === -1) return ""
  const rest = text.slice(start)
  const next = rest.search(/\n\s*const /)
  return next === -1 ? rest : rest.slice(0, next)
}

/** Text from `fromKeyword` up to (but excluding) `toKeyword`. */
const sliceBetween = (
  text: string,
  fromKeyword: string,
  toKeyword: string
): string => {
  const start = text.indexOf(fromKeyword)
  if (start === -1) return ""
  const end = text.indexOf(toKeyword, start)
  return end === -1 ? text.slice(start) : text.slice(start, end)
}

const pageSrc = {
  tradeDetail: src("src/pages/TradeDetailPage.tsx"),
  disputeDetail: src("src/pages/DisputeDetailPage.tsx"),
  dispute: src("src/pages/DisputePage.tsx"),
}

// ─── matrix ↔ ABI surface ────────────────────────────────────────────────────

const matrixMutatingFor = (contract: string): string[] =>
  ESCROW_FUNCTION_MATRIX.filter(
    (s) =>
      s.contract === contract && MUTATING_FN_NAMES.has(s.fn) && s.fn !== "rule"
  )
    .map((s) => s.fn)
    .sort()

describe("escrow ABI surface honours the allow/deny matrix", () => {
  it("KlerosEsc ABI has exactly the documented state-changing functions (no phantoms, nothing missing)", () => {
    const escMutable = mutatingFnNames(KLEROS_ESC_ABI as AbiEntry[]).sort()
    // rule() is a court callback, still a mutating ABI entry — fold it in.
    const expected = [...matrixMutatingFor("KlerosEsc"), "rule"].sort()
    expect(escMutable).toEqual(expected)
  })

  it("KlerosEsc view functions are all present and matrix-listed as anyone-readable", () => {
    const views = fnNames(KLEROS_ESC_ABI as AbiEntry[]).filter(
      (n) => !MUTATING_FN_NAMES.has(n)
    )
    for (const v of views) {
      const spec = ESCROW_FUNCTION_MATRIX.find((s) => s.fn === v)
      expect(spec, `matrix entry for view ${v}`).toBeDefined()
      expect(spec!.caller).toContain("anyone")
    }
  })

  it("every mutating function in the matrix must exist in the KlerosEsc ABI", () => {
    const escFn = new Set(fnNames(KLEROS_ESC_ABI as AbiEntry[]))
    for (const s of matrixByContract("KlerosEsc")) {
      expect(escFn.has(s.fn), `${s.fn} should be in KLEROS_ESC_ABI`).toBe(true)
    }
  })

  it("KlerosEscrowFactory ABI: exactly the documented mutating set (create + 4 admin setters)", () => {
    expect(
      mutatingFnNames(KLEROS_ESCROW_FACTORY_ABI as AbiEntry[]).sort()
    ).toEqual(
      [
        "acceptFee",
        "acceptTreasury",
        "createEscrow",
        "setPendingFee",
        "setTreasury",
      ].sort()
    )
  })

  it("KlerosCourt ABI is read-only (no mutating function)", () => {
    expect(mutatingFnNames(KLEROS_COURT_ABI as AbiEntry[])).toEqual([])
  })

  it("ERC20_ABI holds no fund-moving positiveAllowance surprises", () => {
    expect(mutatingFnNames(ERC20_ABI as AbiEntry[]).sort()).toEqual(["approve"])
  })

  it("event ABI covers the full documented event surface (nothing allowed to be missing for the indexer)", () => {
    const events = new Set(
      (KLEROS_ESC_EVENTS_ABI as AbiEntry[])
        .filter((e) => e.type === "event")
        .map((e) => e.name ?? "")
    )
    expect(events).toEqual(
      new Set([
        "Initialized",
        "BuyerSecurityDeposited",
        "SellerSecurityDeposited",
        "SellerFundsLocked",
        "TradeFullyFunded",
        "TradeCancelled",
        "FundsReturned",
        "Confirmed",
        "Released",
        "DisputeRaised",
        "AppealFunded",
        "RulingReceived",
        "RulingExecuted",
        "Finalized",
        "DisputeTimedOut",
        "MetaEvidence",
        "Dispute",
        "Evidence",
      ])
    )
  })
})

// ─── protocol constants ───────────────────────────────────────────────────────

describe("protocol constants match the documented contract (contract-execution-status.md)", () => {
  it("ruling domain: NUMBER_OF_CHOICES = 4, rulings 0..4", () => {
    expect(NUMBER_OF_CHOICES).toBe(4n)
    expect(Object.values(Ruling).filter((v) => typeof v === "number")).toEqual([
      0, 1, 2, 3, 4,
    ])
  })
  it("security deposit bounds: MIN 1% (100bps), MAX 15% (1500bps), default 10% (1000bps)", () => {
    expect(MIN_SECURITY_DEPOSIT_BPS).toBe(100n)
    expect(MAX_SECURITY_DEPOSIT_BPS).toBe(1500n)
    expect(DEFAULT_SECURITY_DEPOSIT_BPS).toBe(1000n)
  })
  it("timing: grace ≤ 365d, default 7d, cancel timelock 1d, dispute timeout 30d", () => {
    expect(MAX_GRACE_PERIOD_SECONDS).toBe(365n * 24n * 3600n)
    expect(DEFAULT_GRACE_PERIOD_SECONDS).toBe(7n * 24n * 3600n)
    expect(CANCEL_TIMELOCK_SECONDS).toBe(1n * 24n * 3600n)
    expect(DISPUTE_TIMEOUT_SECONDS).toBe(30n * 24n * 3600n)
  })
  it("klerosCourt pinned to the documented mainnet court", () => {
    expect(KLEROS_COURT_MAINNET.toLowerCase()).toBe(
      "0x988b3a538b618c7a603e1c11ab82cd16dbe28069"
    )
  })
})

// ─── state machines ───────────────────────────────────────────────────────────

describe("state machine enums are exact (a wrong enum reorders/renames the state)", () => {
  it("KlerosEscState: AWAITING_FUNDING(0) → … → CANCELLED(7) in documented order", () => {
    expect(Object.values(KlerosEscState)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
  it("KlerosDisputeStatus: WAITING(0) / APPEALABLE(1) / SOLVED(2)", () => {
    expect(KLEROS_DISPUTE_STATUS).toEqual({
      WAITING: 0n,
      APPEALABLE: 1n,
      SOLVED: 2n,
    })
  })
  it("SEVERITY_TO_APPLEVEL: Low 0 … Critical 3", () => {
    expect(SEVERITY_TO_APPLEVEL).toEqual({
      Low: 0,
      Medium: 1,
      High: 2,
      Critical: 3,
    })
  })
})

// ─── client action gates (off-chain mirror of the contract allow/deny) ──────

describe("client gates mirror the matrix — ALLOWED only the matrix caller, DENY everything else", () => {
  it("buyer-only actions are gated on isBuyer", () => {
    expect(pageSrc.tradeDetail).toMatch(
      /const showBuyerDeposit =[\s\S]*?!!isBuyer && liveState === KlerosEscState\.AWAITING_FUNDING/
    )
    expect(pageSrc.tradeDetail).toMatch(
      /const showBuyerConfirm =[\s\S]*?!!isBuyer && liveState === KlerosEscState\.FUNDED/
    )
  })

  it("seller-only actions (deposit + lock) are gated on isSeller", () => {
    expect(pageSrc.tradeDetail).toMatch(
      /const showSellerDeposit =[\s\S]*?!!isSeller[\s\S]*?AWAITING_FUNDING/
    )
    expect(pageSrc.tradeDetail).toMatch(
      /const showSellerLock =[\s\S]*?!!isSeller[\s\S]*?AWAITING_FUNDING[\s\S]*?buyerSecurityDeposited/
    )
  })

  it("raiseDispute (either party) is gated on (isBuyer || isSeller) and the contract window", () => {
    expect(pageSrc.tradeDetail).toMatch(/\(isBuyer \|\| isSeller\)/)
  })

  it("cancelTrade (either party) is gated on the buying or selling party conditions", () => {
    const block = sliceBetween(
      pageSrc.tradeDetail,
      "const { showCancel } = useMemo(() => {",
      "return { showCancel: buyerOk || sellerOk }"
    )
    expect(block).toMatch(/buyerOk/)
    expect(block).toMatch(/sellerOk/)
    expect(block).toMatch(/fundsLocked/)
    expect(block).toMatch(/CANCEL_TIMELOCK_SECONDS/)
  })

  it("release + executeRuling are permissionless: NOT role-gated (keeper pattern)", () => {
    const release = sliceUntilNextConst(
      pageSrc.tradeDetail,
      "const showRelease ="
    )
    expect(release).toContain("CONFIRMED_PENDING")
    expect(release).toContain("gracePeriodElapsed")
    expect(release).not.toMatch(/isBuyer|isSeller/)
    const exec = sliceUntilNextConst(
      pageSrc.tradeDetail,
      "const showExecuteRuling ="
    )
    expect(exec).toContain("RULING_RECEIVED")
    expect(exec).not.toMatch(/isBuyer|isSeller/)
  })

  it("DisputeDetailPage keeper actions (executeRuling / finalize / timeoutDispute) removed the isFiler role gate", () => {
    for (const k of [
      "const canExecuteRuling =",
      "const canFinalize =",
      "const canTimeout =",
    ]) {
      const block = sliceUntilNextConst(pageSrc.disputeDetail, k)
      expect(block, k).not.toMatch(/isBuyer|isSeller|filerRole/)
    }
  })

  it("evidence submission is parties-only (submitEvidence matrix: either)", () => {
    expect(pageSrc.disputeDetail).toMatch(/filerRole && canSubmitMoreEvidence/)
  })

  it("raiseDispute is invoked with the arbitration fee; filerRole is derived from the escrow parties", () => {
    expect(pageSrc.dispute).toMatch(/functionName: 'raiseDispute'/)
    expect(pageSrc.dispute).toMatch(/escrowState\.buyer\.toLowerCase\(\)/)
    expect(pageSrc.dispute).toMatch(/escrowState\.seller\.toLowerCase\(\)/)
  })

  it('all matrix entries declare a caller — nothing is left "who-may-call-unverified"', () => {
    for (const s of ESCROW_FUNCTION_MATRIX) {
      expect(
        s.caller.length,
        `${s.fn} has an empty allow list`
      ).toBeGreaterThan(0)
      expect(
        s.source,
        `${s.fn} must be sourced (contract-doc/abi/client-gate)`
      ).not.toBe("unverified")
    }
  })
})
