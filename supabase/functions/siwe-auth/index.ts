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
//   auth user (needed for `supabase.auth.setSession` on the client).
//
// Session issuance: the platform GoTrue validates ONLY tokens signed with its
// own ES256 private key (the injected SUPABASE_JWKS is public-only and legacy
// HS256 secrets are not accepted). A self-minted JWT can therefore never pass
// the platform's signature check, so this function lets GoTrue itself mint the
// session: it issues a server-side magiclink for the wallet email and exchanges
// it at the client-facing /verify endpoint with the injected anon key. RLS
// authorizes via the `wallet_address` claim inside `user_metadata`
// (see migrations/20260908000001 siwe_go_true_claim_fix).
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
// Env (URL + service role + anon key are auto-injected):
//   SUPABASE_URL                (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY   (auto-injected)
//   SUPABASE_ANON_KEY           (auto-injected)
//
// Deploy:
//   supabase functions deploy siwe-auth --no-verify-jwt
//
// Allowed SIWE URIs — messages whose URI host is not here are rejected so a
// crafted challenge can't be phished onto another origin. The pure
// authorization logic (parser, allowlist, TTLs) lives in ../_shared/siwe-core.ts
// so the penetration test suite can exercise it without a Deno runtime.
import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import { verifyMessage } from "npm:viem@2"
import {
  ALLOWED_URI_HOSTS,
  MAX_ACTIVE_NONCES,
  NONCE_TTL_MINUTES,
  normalizeAddress,
  parseSiweMessage,
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
  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      { error: "Missing SUPABASE_URL / SERVICE_ROLE_KEY" },
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
    return handleVerify(body, supabaseUrl, serviceRoleKey)
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




async function handleVerify(
  body: SignInRequest,
  supabaseUrl: string,
  serviceRoleKey: string
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

  // 3-5. Provision identity + session (fail → clean 500 JSON).
  try {
    // 3. Provision the GoTrue auth user (session mechanics) linked to the
    //    wallet, then 5. hand the session minting to GoTrue itself (see below).
    // 5. Session: the platform GoTrue validates ONLY tokens minted with its
    //    own ES256 private key (the injected SUPABASE_JWKS is public-only and
    //    no legacy HS256 secret is accepted). A self-minted JWT can therefore
    //    never pass the platform's signature check — so we let GoTrue itself
    //    mint the session by exchanging a server-side magiclink for the
    //    wallet-scoped auth user created in step 3.
    const authUid = await getOrCreateAuthUser(admin, parsed.address)
    void authUid

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

    const session = await exchangeMagiclinkSession(
      supabaseUrl,
      serviceRoleKey,
      parsed.address
    )

    return json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user,
    })
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
    if (data?.user) {
      // Backfill the wallet claim on the GoTrue user. RLS resolves the
      // active wallet via `auth.jwt() -> 'user_metadata' ->> 'wallet_address'`,
      // and GoTrue only embeds the metadata that exists AT token-mint time —
      // auth users created before the metadata convention, or migrated from
      // an earlier sign-in flow, would otherwise mint JWTs WITHOUT the claim
      // and `current_user_id()` would resolve to NULL, silently denying every
      // RLS read/write (messages, notifications, conversation lookups…).
      await ensureWalletMetadata(admin, data.user.id, addr)
      return data.user.id
    }
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
      if (retry?.auth_user_id) {
        await ensureWalletMetadata(admin, retry.auth_user_id, addr)
        return retry.auth_user_id
      }
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

/**
 * Make sure the GoTrue auth user's `user_metadata.wallet_address` matches
 * `addr`. GoTrue signs it into every subsequent session JWT, and the SIWE RLS
 * layer (see migrations/20260908000001) reads it from there — so an auth user
 * without the claim would mint "valid" sessions that every wallet-scoped RLS
 * policy silently denies. Idempotent: no-op when the claim already matches.
 */
async function ensureWalletMetadata(
  admin: ReturnType<typeof createClient>,
  authUid: string,
  addr: string
): Promise<void> {
  const { data: u } = await admin.auth.admin.getUserById(authUid)
  const meta = (u?.user?.user_metadata ?? {}) as Record<string, unknown>
  if (meta.wallet_address === addr) return
  await admin.auth.admin.updateUserById(authUid, {
    user_metadata: { ...meta, wallet_address: addr },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Let GoTrue mint the session. Server-side: issue a magiclink for the wallet
 * email via the admin API, then exchange the token_hash at the client-facing
 * /verify endpoint (with the injected anon key). The resulting access_token
 * is signed with the platform's ES256 private key and passes every GoTrue /
 * PostgREST signature check — something a self-minted JWT can never do on
 * projects whose signing key never leaves the platform.
 */
async function exchangeMagiclinkSession(
  supabaseUrl: string,
  serviceRoleKey: string,
  addr: string
): Promise<{ access_token: string; refresh_token: string; user: unknown }> {
  const email = `${addr.replace(/^0x/, "")}@${WALLET_EMAIL_DOMAIN}`

  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  })
  if (!linkRes.ok) {
    console.error(
      "siwe-auth: generate_link failed",
      linkRes.status,
      (await linkRes.text()).slice(0, 300)
    )
    throw new Error("Magic link issuance failed")
  }
  const linkData = await linkRes.json()
  const tokenHash =
    linkData?.hashed_token ??
    linkData?.token_hash ??
    linkData?.properties?.token_hash
  if (typeof tokenHash !== "string" || !tokenHash) {
    throw new Error("Magic link exchange produced no token_hash")
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  })
  if (!verifyRes.ok) {
    console.error(
      "siwe-auth: verify exchange failed",
      verifyRes.status,
      (await verifyRes.text()).slice(0, 300)
    )
    throw new Error("Session exchange failed")
  }
  const session = await verifyRes.json()
  if (typeof session?.access_token !== "string") {
    throw new Error("Session exchange returned no access_token")
  }
  return {
    access_token: session.access_token,
    refresh_token:
      typeof session.refresh_token === "string"
        ? session.refresh_token
        : "siwe-wallet-session",
    user: session.user ?? null,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}


