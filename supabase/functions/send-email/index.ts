// Supabase Edge Function: send-email
//
// Called by the client's notification dispatcher
// (src/lib/notifications/channels/email.ts) via supabase.functions.invoke().
//
// Required secrets (set with `supabase secrets set`):
//   RESEND_API_KEY   - API key from https://resend.com/api-keys
//   EMAIL_FROM       - Sender address, e.g. "CofferNode <noreply@yourdomain.com>"
//
// Deploy:
//   supabase functions deploy send-email --no-verify-jwt
//
// Test locally (with the Supabase stack running):
//   supabase functions serve send-email --no-verify-jwt --env-file ./supabase/.env.local

interface Payload {
  to: string
  subject: string
  text: string
  html?: string
}

const RESEND_URL = 'https://api.resend.com/emails'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!apiKey) return json({ error: 'RESEND_API_KEY not configured' }, 500)
  if (!from) return json({ error: 'EMAIL_FROM not configured' }, 500)

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!payload.to || !payload.subject || !payload.text) {
    return json({ error: 'Missing required fields: to, subject, text' }, 400)
  }

  // Basic shape check on the recipient — refuse anything that looks wrong
  // before paying for an outbound API call.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.to)) {
    return json({ error: 'Invalid recipient email' }, 400)
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('Resend API error', res.status, detail)
      return json({ error: 'Provider rejected the email', status: res.status, detail }, 502)
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return json({ ok: true, id: data.id ?? null }, 200)
  } catch (err) {
    console.error('send-email crashed', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
