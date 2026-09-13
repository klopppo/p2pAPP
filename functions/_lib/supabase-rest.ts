// Tiny Supabase REST helper for edge functions. No SDK — keeps the worker
// bundle small. The READ key must be a *restricted* credential (anon today,
// a dedicated reader role once Fase 1 lands); it NEVER leaves the server.

export interface EdgeEnv {
  SUPABASE_URL: string
  SUPABASE_READ_KEY: string
  PURGE_SECRET: string
  ASSETS: {
    fetch(
      input: Request | URL | string,
      init?: RequestInit,
    ): Promise<Response>
  }
}

export async function edgeFetch(env: EdgeEnv, path: string): Promise<unknown> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}${path}`, {
      headers: {
        apikey: env.SUPABASE_READ_KEY,
        authorization: `Bearer ${env.SUPABASE_READ_KEY}`,
        accept: 'application/json',
      },
    })
    if (!res.ok) {
      console.error(`[edge] GET ${path} -> ${res.status} ${res.statusText}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.error(`[edge] GET ${path} failed:`, err)
    return null
  }
}