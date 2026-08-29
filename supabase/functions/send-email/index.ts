// Supabase Edge Function: send-email
//
// Called by the client's notification dispatcher
// (src/lib/notifications/channels/email.ts) via supabase.functions.invoke().
//
// Required secrets (set with `supabase secrets set`):
//   RESEND_API_KEY   - API key from https://resend.com/api-keys
//   EMAIL_FROM       - Sender address, e.g. "CofferNode <noreply@yourdomain.com>"
//
// Security model (see docs/security-audit.md §6):
//   - The recipient is NEVER taken from the client. The caller supplies only
//     `user_id`; this function resolves the address server-side from that
//     user's `notification_preferences` row. Barring RLS abuse this blocks
//     arbitrary-recipient spam.
//   - HTML content is refused outright — this relay only ever sends plain
//     text, so a caller cannot phish with full-content HTML emails.
//   - A per-recipient rate limit (2 / 60s, in-memory) caps financial + inbox
//     abuse. In-memory is best-effort under multiple isolates; layer real
//     rate limiting on top once SIWE/JWT auth lands.
//   - The request must come through the Supabase client (bearer + apikey
//     headers present). This does NOT authenticate the caller yet — real
//     enforcement requires the SIWE edge function minting JWTs, at which
//     point deploy with `--verify-jwt` and validate `user_id` === the calling
//     user's id.
//
// Deploy:
//   supabase functions deploy send-email --no-verify-jwt
//
// Test locally (with the Supabase stack running):
//   supabase functions serve send-email --no-verify-jwt --env-file ./supabase/.env.local
//
// The pure authorization logic (origin allowlist, CRLF/size sanitization,
// per-recipient rate limit, recipient validation) lives in
// ../_shared/email-core.ts so the penetration test suite can exercise it
// without a Deno runtime.

import {
  ALLOWED_ORIGINS,
  isValidEmailTo,
  rateLimited,
  sanitizeLine,
  SUBJECT_MAX_LENGTH,
  TEXT_MAX_LENGTH,
} from "../_shared/email-core.ts"

interface Payload {
  /** Owning user of the notification — the single most the client provides. */
  user_id: string
  subject: string
  text: string
}

const RESEND_URL = "https://api.resend.com/emails"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? ""
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response("Origin not allowed", { status: 403 })
  }
  const cors = { ...corsHeaders, "Access-Control-Allow-Origin": origin || "*" }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors })
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors)
  }

  const apiKey = Deno.env.get("RESEND_API_KEY")
  const from = Deno.env.get("EMAIL_FROM")
  if (!apiKey)
    return json({ error: "RESEND_API_KEY not configured" }, 500, cors)
  if (!from) return json({ error: "EMAIL_FROM not configured" }, 500, cors)

  // Gate on the Supabase client headers. Weak by itself (the anon key is
  // public), but it stops plain unauthenticated callers and sets the shape
  // for the real JWT check once SIWE mints sessions.
  if (!req.headers.has("authorization") || !req.headers.has("apikey")) {
    return json({ error: "Missing Supabase client headers" }, 401, cors)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  if (!supabaseUrl)
    return json({ error: "SUPABASE_URL not available" }, 500, cors)

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return json({ error: "Invalid JSON body" }, 400, cors)
  }

  if (!payload.user_id || !payload.subject || !payload.text) {
    return json(
      { error: "Missing required fields: user_id, subject, text" },
      400,
      cors
    )
  }

  const subject = sanitizeLine(payload.subject, SUBJECT_MAX_LENGTH)
  const text = sanitizeLine(payload.text, TEXT_MAX_LENGTH)
  if (!subject || !text) {
    return json(
      { error: "Empty subject or text after sanitization" },
      400,
      cors
    )
  }

  // Resolve the recipient server-side from the user's preferences row. We
  // never accept a client-supplied `to` — that was the open-relay hole.
  const apikey = req.headers.get("apikey") ?? ""
  const prefsRes = await fetch(
    `${supabaseUrl}/rest/v1/notification_preferences` +
      `?user_id=eq.${encodeURIComponent(payload.user_id)}&channel=eq.email&select=email_address,enabled`,
    { headers: { apikey, Authorization: `Bearer ${apikey}` } }
  )
  if (!prefsRes.ok) {
    console.error("send-email: preferences lookup failed", prefsRes.status)
    return json({ error: "Failed to resolve recipient" }, 502, cors)
  }
  const prefs = (await prefsRes.json()) as Array<{
    email_address: string | null
    enabled: boolean | null
  }>
  const prefsRow = prefs[0]
  const to = prefsRow?.email_address
  if (!to || prefsRow?.enabled !== true) {
    return json({ error: "Email channel not enabled for this user" }, 400, cors)
  }
  if (!isValidEmailTo(to)) {
    return json({ error: "Invalid recipient on file" }, 400, cors)
  }

  // Per-recipient rate limit AFTER the DB round-trip so the check itself is
  // not spammable and resets naturally when the address no longer resolves.
  if (rateLimited(to)) {
    return json({ error: "Rate limit exceeded for recipient" }, 429, cors)
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      console.error("Resend API error", res.status, detail)
      return json(
        { error: "Provider rejected the email", status: res.status, detail },
        502,
        cors
      )
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return json({ ok: true, id: data.id ?? null }, 200, cors)
  } catch (err) {
    console.error("send-email crashed", err)
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
      cors
    )
  }
})

function json(body: unknown, status = 200, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
}
