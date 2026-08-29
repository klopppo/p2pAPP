// siwe-core -- pure, dependency-free helpers shared between the siwe-auth edge
// function (Deno) and the vitest penetration suite (node).
//
// Kept free of any `Deno.*` / `npm:` imports on purpose so the test runner can
// import it directly. The authorization-relevant logic lives here:
//
//   - ALLOWED_URI_HOSTS : phishing guard — a crafted SIWE challenge whose URI
//     points at another origin is rejected before the nonce is even consulted.
//   - parseSiweMessage  : minimal, strict EIP-4361 parser.
//   - normalizeAddress  : canonical lower-cased 0x… checksummed-length address.

export interface ParsedSiweMessage {
  address: string
  uriHost: string
  version: string
  nonce: string
  issuedAt: string
}

export const ALLOWED_URI_HOSTS: ReadonlySet<string> = new Set([
  "coffernode.app",
  "localhost",
  "127.0.0.1",
])

export const NONCE_TTL_MINUTES = 5
export const SESSION_TTL_SECONDS = 60 * 60 * 24 // 24h; refresh flow is a follow-up
export const WALLET_EMAIL_DOMAIN = "wallet.coffernode"

/** Max active (unused) nonces per address before issuance is refused. */
export const MAX_ACTIVE_NONCES = 5

/**
 * Minimal EIP-4361 parser. Throws on malformed input. Mirrors the exact fields
 * the app signs for, so a signature over a message we cannot parse is never
 * accepted.
 */
export function parseSiweMessage(message: string): ParsedSiweMessage {
  const lines = message.split("\n").map((l) => l.replace(/\r$/, ""))
  // Line 0: "<domain> wants you to sign in with your Ethereum account:"
  const header = lines[0] ?? ""
  if (!header.endsWith(" wants you to sign in with your Ethereum account:")) {
    throw new Error("Not a SIWE message")
  }

  const address = (lines[1] ?? "").trim().toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error("Missing address")

  const field = (name: string): string | undefined => {
    const prefix = `${name}: `
    const line = lines.find((l) => l.startsWith(prefix))
    return line ? line.slice(prefix.length).trim() : undefined
  }
  const uri = field("URI")
  const version = field("Version")
  const nonce = field("Nonce")
  const issuedAt = field("Issued At")
  if (!uri || !version || !nonce || !issuedAt)
    throw new Error("Missing SIWE fields")

  let uriHost: string
  try {
    uriHost = new URL(uri).hostname.toLowerCase()
  } catch {
    throw new Error("Malformed URI")
  }

  return { address, uriHost, version, nonce, issuedAt }
}

/** Canonical wallet form — lower-cased, checksummed length (0x + 40 hex). NULL on junk. */
export function normalizeAddress(address: string | undefined): string | null {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  return address.toLowerCase()
}
