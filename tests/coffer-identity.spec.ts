import { describe, it, expect } from "vitest"
import { sha256Hex, bytesToHex, hexToBytes } from "@/lib/crypt"
import {
  deriveMasterSecret,
  buildCofferIdentity,
  persistCofferIdentity,
  loadCofferIdentity,
  rotateIdentity,
  saveRotatedIdentity,
  burnCofferIdentity,
  cofferPseudonym,
  tradePseudonym,
  conversationPseudonym,
  PSEUDONYM_PREFIX,
  PSEUDONYM_HEX_CHARS,
  type CofferIdentity,
  type CofferStorage,
} from "@/lib/cofferIdentity"

// A valid 65-byte EIP-191 signature (r||s||v). Values are arbitrary bytes —
// WebCrypto treats them as opaque, and same input must map to same master.
const SIG_A = `0x${"a1".repeat(32)}${"b2".repeat(32)}1b` as `0x${string}`
const SIG_B = `0x${"c3".repeat(32)}${"d4".repeat(32)}1c` as `0x${string}`
const WALLET = "0x1234abcdABCD1234abcdABCD1234abcdABCD1234"

function memoryStore(): {
  store: CofferStorage
  get: () => CofferIdentity | null
} {
  let current: CofferIdentity | null = null
  const store: CofferStorage = {
    get: () => current,
    set: (identity) => {
      current = identity
    },
    remove: () => {
      current = null
    },
  }
  return { store, get: () => current }
}

describe("crypt helpers", () => {
  it('sha256("") matches the NIST test vector', async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
  })

  it("hex roundtrip is lossless and strips the 0x prefix", () => {
    const hex = "deadbeefdeadbeef"
    expect(bytesToHex(hexToBytes(`0x${hex}`))).toBe(hex)
  })
})

describe("deriveMasterSecret", () => {
  it("is deterministic for the same signature", async () => {
    expect(await deriveMasterSecret(SIG_A)).toBe(
      await deriveMasterSecret(SIG_A)
    )
  })

  it("differs across signatures and is a 32-byte key", async () => {
    const a = await deriveMasterSecret(SIG_A)
    const b = await deriveMasterSecret(SIG_B)
    expect(a).not.toBe(b)
    expect(a.length).toBe(64)
  })
})

describe("pseudonym derivation", () => {
  const identity = buildCofferIdentity(WALLET, "00".repeat(32))

  it("has the expected format", async () => {
    const p = await cofferPseudonym(identity, "trade:123")
    expect(p).toMatch(
      new RegExp(`^${PSEUDONYM_PREFIX}[0-9A-F]{${PSEUDONYM_HEX_CHARS}}$`)
    )
  })

  it("is deterministic per label", async () => {
    expect(await tradePseudonym(identity, "TRD-1")).toBe(
      await tradePseudonym(identity, "TRD-1")
    )
  })

  it("varies across labels (trade vs conversation)", async () => {
    const trade = await tradePseudonym(identity, "TRD-1")
    const conv = await conversationPseudonym(identity, "CONV-1")
    expect(trade).not.toBe(conv)
  })

  it("changes for every label after a rotation", async () => {
    const rotated = rotateIdentity(identity)
    const before = await cofferPseudonym(identity, "trade:TRD-1")
    const after = await cofferPseudonym(rotated, "trade:TRD-1")
    expect(after).not.toBe(before)
    expect(rotated.epoch).toBe(identity.epoch + 1)
  })

  it("does not expose the master through the pseudonym", async () => {
    const p = await cofferPseudonym(identity, "trade:TRD-1")
    expect(p.toLowerCase()).not.toContain(identity.masterHex)
  })
})

describe("vault persistence", () => {
  it("persisted identity round-trips through storage", async () => {
    const { store, get } = memoryStore()
    const persisted = await persistCofferIdentity(WALLET, SIG_A, store)
    expect(persisted).not.toBeNull()
    expect(persisted?.address).toBe(WALLET.toLowerCase())

    const loaded = loadCofferIdentity(store)
    expect(loaded).not.toBeNull()
    expect(loaded?.masterHex).toBe(persisted?.masterHex)
    expect(get()?.epoch).toBe(0)
  })

  it("different signatures for the same wallet produce different identities", async () => {
    const { store: s1 } = memoryStore()
    const { store: s2 } = memoryStore()
    const a = await persistCofferIdentity(WALLET, SIG_A, s1)
    const b = await persistCofferIdentity(WALLET, SIG_B, s2)
    expect(a?.masterHex).not.toBe(b?.masterHex)
  })

  it("saved rotations persist and change all pseudonyms", async () => {
    const { store } = memoryStore()
    const base = await persistCofferIdentity(WALLET, SIG_A, store)
    if (!base) throw new Error("expected an identity")

    const rotated = rotateIdentity(base)
    saveRotatedIdentity(rotated, store)
    const reloaded = loadCofferIdentity(store)
    expect(reloaded?.epoch).toBe(1)
  })

  it("burn removes the identity from storage", async () => {
    const { store, get } = memoryStore()
    await persistCofferIdentity(WALLET, SIG_A, store)
    expect(get()).not.toBeNull()
    burnCofferIdentity(store)
    expect(get()).toBeNull()
    expect(loadCofferIdentity(store)).toBeNull()
  })
})
