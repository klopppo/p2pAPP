/**
 * Pure Web Crypto helpers used by the Coffer Identity vault.
 *
 * Everything here is framework-agnostic and testable in Node (vitest) — it
 * only relies on `crypto.subtle` (webcrypto), which Node ≥ 19 exposes on
 * `globalThis` and browsers expose natively.
 *
 * Security notes:
 *  - HKDF-SHA256 is used for both the identity *master* derivation (IKM = the
 *    deterministic ECDSA signature bytes) and for every per-label *expansion*
 *    key, so no label ever exposes the master.
 *  - The master secret / derived keys are app-layer only: they can NOT move
 *    funds and can NOT reconstruct the wallet's private key.
 */

const subtleCrypto = (): SubtleCrypto => {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle
  }
  throw new Error(
    "WebCrypto (crypto.subtle) is not available in this environment"
  )
}

const encoder = new TextEncoder()

export function bytesToHex(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0")
  }
  return out
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  if (clean.length % 2 !== 0)
    throw new Error("hex string must have even length")
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error(`invalid hex byte at index ${i}`)
    out[i] = byte
  }
  return out
}

export function toBytes(data: Uint8Array | string): BufferSource {
  if (data instanceof Uint8Array) return data as BufferSource
  return encoder.encode(data) as BufferSource
}

export async function sha256Bytes(
  data: Uint8Array | string
): Promise<Uint8Array> {
  const digest = await subtleCrypto().digest("SHA-256", toBytes(data))
  return new Uint8Array(digest)
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  return bytesToHex(await sha256Bytes(data))
}

export interface HkdfOptions {
  ikm: Uint8Array | string
  salt?: Uint8Array | string
  info?: Uint8Array | string
  length: number
}

export async function hkdfSha256(options: HkdfOptions): Promise<Uint8Array> {
  const key = await subtleCrypto().importKey(
    "raw",
    toBytes(options.ikm),
    "HKDF",
    false,
    ["deriveBits"]
  )
  const bits = await subtleCrypto().deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBytes(options.salt ?? new Uint8Array(0)),
      info: toBytes(options.info ?? new Uint8Array(0)),
    },
    key,
    options.length * 8
  )
  if (bits.byteLength !== options.length) {
    throw new Error("hkdf derivation produced an unexpected number of bits")
  }
  return new Uint8Array(bits)
}
