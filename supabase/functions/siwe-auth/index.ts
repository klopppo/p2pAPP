// Supabase Edge Function: siwe-auth
//
// Server-side Sign-In with Ethereum — the identity foundation for the app's
// RLS rewrite (see docs/security-audit.md §1, docs/todo.md "Security P1").
//
// Flow:
//   POST /nonce  { address }                     -> { nonce }
//   POST /verify { message, signature }          -> { access_token, user }
//
//   The nonce is stored server-side in `siwe_nonces` (one-shot, 5 min TTL),
//   issued/bound to the requesting address. /verify re-verifies the EIP-4361
//   signature with viem, consumes the nonce atomically, provisions a GoTrue
//   auth user (needed for `supabase.auth.setSession` on the client) and returns
//   a minted JWT.
//
// Identity model (wallet-primary):
//   • RLS does NOT use auth.uid(). Every policy authorizes through the JWT
//     claim `wallet_address` → public.current_user_id() (see
//     migrations/20260829000002_siwe_auth_rls.sql).
//   • The GoTrue `auth.users` row exists only so the client SDK can store a
//     session; `sub` is that auth user id, NOT public.users.id. The link is
//     tracked in `siwe_auth_links` (wallet → auth_user_id).
//   • public.users rows keep their own ids (pre-existing rows are untouched)
//     and are created/updated keyed by the unique wallet_address.
//
// Env (auto-injected in prod; pass via --env-file when serving locally):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_JWT_SECRET
//
// Deploy:
//   supabase functions deploy siwe-auth --no-verify-jwt
//
// Allowed SIWE URIs — messages whose URI host is not here are rejected so a
// crafted challenge can't be phished onto another origin. The pure
// authorization logic (parser, allowlist, TTLs) lives in ../_shared/siwe-core.ts
// so the penetration test suite can exercise it without a Deno runtime.
import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import { SignJWT } from "npm:jose@5"
import { verifyMessage } from "npm:viem@2"
import {
  ALLOWED_URI_HOSTS,
  MAX_ACTIVE_NONCES,
  NONCE_TTL_MINUTES,
  normalizeAddress,
  parseSiweMessage,
  SESSION_TTL_SECONDS,
  WALLET_EMAIL_DOMAIN,
  type ParsedSiweMessage,
} from "../_shared/siwe-core.ts"

const INCORRECT_HOST_ERROR = "URI host is not allowed for this app"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

interface SignInRequest {
  action: "nonce" | "verify"
  address?: string
  message?: string
  signature?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET")
  if (!supabaseUrl || !serviceRoleKey || !jwtSecret) {
    return json(
      { error: "Missing SUPABASE_URL / SERVICE_ROLE_KEY / JWT_SECRET" },
      500
    )
  }

  let body: SignInRequest
  try {
    body = (await req.json()) as SignInRequest
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  if (body.action === "nonce") {
    return issueNonce(body.address, supabaseUrl, serviceRoleKey)
  }
  if (body.action === "verify") {
    return verifyAndMint(body, supabaseUrl, serviceRoleKey, jwtSecret)
  }
  return json({ error: "Unknown action" }, 400)
})

// ---------------------------------------------------------------------------
// Nonce issuance
// ---------------------------------------------------------------------------

async function issueNonce(
  address: string | undefined,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<Response> {
  const addr = normalizeAddress(address)
  if (!addr) return json({ error: "Invalid address" }, 400)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // Bounded sweep of expired nonces (keeps the table from growing forever).
    await admin
      .from("siwe_nonces")
      .delete()
      .lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())

    // Raise the bar for repeat nonce requests from the same address.
    const { count } = await admin
      .from("siwe_nonces")
      .select("nonce", { count: "exact", head: true })
      .eq("address", addr)
      .is("used_at", null)
      .gt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    if ((count ?? 0) >= MAX_ACTIVE_NONCES) {
      return json({ error: "Too many active nonces" }, 429)
    }

    const nonce = crypto.randomUUID()
    const { error } = await admin.from("siwe_nonces").insert({
      nonce,
      address: addr,
    })
    if (error) {
      console.error("siwe-auth: nonce insert failed", error)
      return json({ error: "Failed to issue nonce" }, 500)
    }
    return json({ nonce })
  } catch (err) {
    console.error("siwe-auth: issueNonce crashed", err)
    return json({ error: "Internal error" }, 500)
  }
}

// ---------------------------------------------------------------------------
// Verification + JWT mint
// ---------------------------------------------------------------------------

async function verifyAndMint(
  body: SignInRequest,
  supabaseUrl: string,
  serviceRoleKey: string,
  jwtSecret: string
): Promise<Response> {
  const { message, signature } = body
  if (!message || !signature) {
    return json({ error: "Missing message or signature" }, 400)
  }
  if (!/^0x[0-9a-fA-F]{130,134}$/.test(signature)) {
    return json({ error: "Malformed signature" }, 400)
  }

  let parsed: ParsedSiweMessage
  try {
    parsed = parseSiweMessage(message)
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Malformed message" },
      400
    )
  }

  if (!ALLOWED_URI_HOSTS.has(parsed.uriHost)) {
    return json({ error: INCORRECT_HOST_ERROR }, 400)
  }
  if (parsed.version !== "1")
    return json({ error: "Unsupported SIWE version" }, 400)

  // Authz: the message is only valid if iat is fresh.
  const issuedAtMs = Date.parse(parsed.issuedAt)
  if (Number.isNaN(issuedAtMs)) return json({ error: "Missing Issued At" }, 400)
  if (Date.now() - issuedAtMs > NONCE_TTL_MINUTES * 60_000) {
    return json({ error: "Challenge expired" }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Consume the nonce (one-shot, address-bound, TTL-bounded).
  const { data: consumed, error: consumeErr } = await admin
    .from("siwe_nonces")
    .update({ used_at: new Date().toISOString() })
    .eq("nonce", parsed.nonce)
    .eq("address", parsed.address)
    .is("used_at", null)
    .gt(
      "created_at",
      new Date(Date.now() - NONCE_TTL_MINUTES * 60_000).toISOString()
    )
    .select("nonce")
    .limit(1)
  if (consumeErr || !consumed?.[0]) {
    return json({ error: "Nonce missing, expired, or already used" }, 400)
  }

  // 2. Cryptographically verify the signature recovered the message address.
  const valid = await verifyMessage({
    address: parsed.address as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  })
  if (!valid) {
    return json({ error: "Signature did not verify" }, 401)
  }

  // 3-5. Provision identity + users row + mint JWT (fail → clean 500 JSON).
  try {
    // 3. Provision the GoTrue auth user (session mechanics) linked to the wallet.
    const authUid = await getOrCreateAuthUser(admin, parsed.address)

    // 4. Ensure the public.users row exists keyed by the unique wallet_address.
    const { data: existing } = await admin
      .from("users")
      .select("id, wallet_address, nickname, avatar_url, created_at")
      .eq("wallet_address", parsed.address)
      .maybeSingle()

    let user = existing
    if (!user) {
      const { data: inserted, error: insertErr } = await admin
        .from("users")
        .insert({
          wallet_address: parsed.address,
          last_active_at: new Date().toISOString(),
        })
        .select("id, wallet_address, nickname, avatar_url, created_at")
        .single()
      if (insertErr || !inserted) {
        console.error("siwe-auth: users insert failed", insertErr)
        return json({ error: "Failed to register user" }, 500)
      }
      user = inserted
    } else {
      await admin
        .from("users")
        .update({ last_active_at: new Date().toISOString() })
        .eq("wallet_address", parsed.address)
    }

    // 5. Mint a minimal Supabase JWT. RLS authorizes via the `wallet_address`
    //    claim (NOT sub); sub is the GoTrue auth user id for session plumbing.
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0]
    const token = await new SignJWT({
      role: "authenticated",
      wallet_address: parsed.address,
      ref: projectRef,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(authUid)
      .setIssuedAt()
      .setExpirationTime(SESSION_TTL_SECONDS + "s")
      .setIssuer("supabase")
      .setAudience("authenticated")
      .setJti(crypto.randomUUID())
      .sign(new TextEncoder().encode(jwtSecret))

    return json({ access_token: token, user })
  } catch (err) {
    console.error("siwe-auth: verifyAndMint provisioning failed", err)
    return json({ error: "Internal error" }, 500)
  }
}

/**
 * Get the existing GoTrue auth user for `addr` or create it. The wallet→auth
 * uid link is persisted in `siwe_auth_links` (service-role only; RLS denies
 * everyone else). Returns the auth user's uuid.
 */
async function getOrCreateAuthUser(
  admin: ReturnType<typeof createClient>,
  addr: string
): Promise<string> {
  const email = `${addr.replace(/^0x/, "")}@${WALLET_EMAIL_DOMAIN}`

  // Fast path: known link.
  const { data: link } = await admin
    .from("siwe_auth_links")
    .select("auth_user_id")
    .eq("wallet_address", addr)
    .maybeSingle()

  if (link?.auth_user_id) {
    const { data } = await admin.auth.admin.getUserById(link.auth_user_id)
    if (data?.user) return data.user.id
    // Dangling link — clear it and re-provision below.
    await admin.from("siwe_auth_links").delete().eq("wallet_address", addr)
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { wallet_address: addr },
  })

  if (error) {
    // Two concurrent first sign-ins for the same wallet: the loser sees
    // `email_exists`. Give the winner's write a moment to land, then retry.
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      await new Promise((resolve) => setTimeout(resolve, 150))
      const { data: retry } = await admin
        .from("siwe_auth_links")
        .select("auth_user_id")
        .eq("wallet_address", addr)
        .maybeSingle()
      if (retry?.auth_user_id) return retry.auth_user_id
    }
    console.error("siwe-auth: createUser failed", error)
    throw new Error("Identity provisioning failed")
  }
  if (!data?.user?.id) {
    throw new Error("Identity provisioning returned no user")
  }

  await admin
    .from("siwe_auth_links")
    .upsert(
      { wallet_address: addr, auth_user_id: data.user.id },
      { onConflict: "wallet_address" }
    )
  return data.user.id
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
