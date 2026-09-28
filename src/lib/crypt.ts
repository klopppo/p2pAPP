/**
 * Pure Web Crypto helpers for the Coffer Identity vault (webcrypto only, so
 * they run in Node ≥ 19 and browsers). HKDF-SHA256 derives the identity master
 * and every per-label expansion key; the master only ever lives on-device and
 * can NOT move funds or reconstruct the wallet private key.
 */

const subtleCrypto = (): SubtleCrypto => {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle
  }
  throw new Error("WebCrypto (crypto.subtle) is not available in this environment")
}

const encoder = new TextEncoder()

export function bytesToHex(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, "0")
  return out
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  if (clean.length % 2 !== 0) throw new Error("hex string must have even length")
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error(`invalid hex byte at index ${i}`)
    out[i] = byte
  }
  return out
}

function toBytes(data: Uint8Array | string): BufferSource {
  return (data instanceof Uint8Array ? data : encoder.encode(data)) as BufferSource
}

async function sha256Bytes(data: Uint8Array | string): Promise<Uint8Array> {
  const digest = await subtleCrypto().digest("SHA-256", toBytes(data))
  return new Uint8Array(digest)
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  return bytesToHex(await sha256Bytes(data))
}

interface HkdfOptions {
  ikm: Uint8Array | string
  salt?: Uint8Array | string
  info?: Uint8Array | string
  length: number
}

export async function hkdfSha256(options: HkdfOptions): Promise<Uint8Array> {
  const key = await subtleCrypto().importKey("raw", toBytes(options.ikm), "HKDF", false, [
    "deriveBits",
  ])
  const bits = await subtleCrypto().deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBytes(options.salt ?? new Uint8Array(0)),
      info: toBytes(options.info ?? new Uint8Array(0)),
    },
    key,
    options.length * 8,
  )
  if (bits.byteLength !== options.length) {
    throw new Error("hkdf derivation produced an unexpected number of bits")
  }
  return new Uint8Array(bits)
}
