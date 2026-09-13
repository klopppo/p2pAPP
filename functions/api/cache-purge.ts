// Cache invalidation hook (OD-04).
//
// Supabase Database Webhooks POST here on offer/user writes; the edge purges
// the matching public document URLs from the CDN cache so s-maxage never
// goes stale-but-wrong. Guarded by a shared secret (PURGE_SECRET) that
// Supabase sends as the `x-webhook-secret` header.

import type { EdgeEnv } from '../_lib/supabase-rest'

interface WebhookPayload {
  table?: string
  type?: string
  record?: Record<string, unknown>
  old_record?: Record<string, unknown>
}

async function purge(urls: string[]): Promise<{ purged: string[]; failed: string[] }> {
  const purged: string[] = []
  const failed: string[] = []
  for (const url of urls) {
    try {
      await caches.default.delete(new Request(url, { method: 'GET' }))
      purged.push(url)
    } catch (err) {
      console.error(`[cache-purge] failed: ${url}`, err)
      failed.push(url)
    }
  }
  return { purged, failed }
}

export const onRequestPost = async ({
  request,
  env,
}: {
  request: Request
  env: EdgeEnv
}): Promise<Response> => {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  if (!env.PURGE_SECRET) return json({ error: 'purge secret not configured' }, 500)
  if (request.headers.get('x-webhook-secret') !== env.PURGE_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }

  let payload: WebhookPayload
  try {
    payload = (await request.json()) as WebhookPayload
  } catch {
    return json({ error: 'invalid json body' }, 400)
  }

  const origin = new URL(request.url).origin
  const table = payload.table ?? ''
  const rec = payload.record ?? payload.old_record ?? {}
  const targets = new Set<string>()

  if (table === 'offers') {
    // Marketplace list + (optionally) the affected offer detail page.
    targets.add(`${origin}/app/offers`)
    if (typeof rec.id === 'string') targets.add(`${origin}/app/offer/${rec.id}`)
  } else if (table === 'users') {
    if (typeof rec.wallet_address === 'string') {
      targets.add(`${origin}/app/profile/${String(rec.wallet_address).toLowerCase()}`)
    }
  }

  if (targets.size === 0) {
    return json({ ok: true, purged: [], note: `no purge mapping for table="${table}"` }, 200)
  }

  const { purged, failed } = await purge([...targets])
  return json({ ok: failed.length === 0, purged, failed }, failed.length ? 500 : 200)
}