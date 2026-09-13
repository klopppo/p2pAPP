// Fase 2 — edge-data hydration E2E (ADR-006 + OD-03).
//
// Verifies: with a `#__EDGE_DATA__` blob injected into the /app/offers HTML
// (exactly what functions/_middleware.ts does in production), the app
// (a) hydrates react-query from it before first paint (trader row visible),
// (b) does NOT issue a Supabase offers fetch for that first paint,
// (c) removes the node and leaves no stuck skeleton, (d) throws no page errors.
//
// Run: npm run preview -- --port 4173  (then)  node tests/e2e/edge-hydration.cjs
// Auto: npm run test:e2e  (spawns preview itself)

const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const net = require('node:net')

const BASE = process.env.BASE_URL || 'http://localhost:4173'
const FAKE_OFFER = {
  id: '11111111-2222-3333-4444-555555555555',
  offer_id: 'OFF-EDGETEST1',
  seller_id: '0xedgetest',
  type: 'sell',
  crypto_token: 'ETH',
  fiat_currency: 'EUR',
  crypto_amount: '0.5',
  price_per_unit: 2800,
  min_amount: 100,
  max_amount: 5000,
  payment_methods: ['Bank Transfer'],
  is_private: false,
  tags: [],
  status: 'active',
  expires_at: '2099-01-01T00:00:00.000Z',
  published_at: '2026-09-13T00:00:00.000Z',
  seller: {
    id: 'u-edge-seller',
    wallet_address: '0xedgetest',
    nickname: 'EdgeSellerX',
    avatar_url: null,
    verification_level: 'unverified',
    total_trades: 3,
    avg_rating: 4.5,
  },
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.createConnection({ port })
      sock.once('connect', () => { sock.destroy(); resolve() })
      sock.once('error', () => {
        sock.destroy()
        if (Date.now() > deadline) reject(new Error(`port ${port} not up in time`))
        else setTimeout(tryOnce, 500)
      })
    }
    tryOnce()
  })
}

async function main() {
  let preview = null
  let ownServer = false
  if (!process.env.PREVIEW_UP) {
    ownServer = true
    preview = spawn('npm', ['run', 'preview', '--', '--port', '4173'], { stdio: 'ignore' })
    await waitForPort(4173, 30000).catch((e) => { throw e })
  }

  const results = {}
  let exitCode = 1
  try {
    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const consoleErrors = []
    const pageErrors = []
    let offersApiCalls = 0

    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    page.on('request', (r) => {
      if (/supabase\.co\/rest\/v1\/offers/.test(r.url())) offersApiCalls++
    })

    await page.route('**/app/offers', async (route) => {
      const res = await route.fetch()
      const html = await res.text()
      const payload = { pathname: '/app/offers', publicData: { offers: [FAKE_OFFER] } }
      const injected = html.replace(
        '</head>',
        `<script id="__EDGE_DATA__" type="application/json">${JSON.stringify(payload)}</script></head>`,
      )
      await route.fulfill({
        status: res.status(),
        headers: { ...res.headers(), 'content-type': 'text/html; charset=utf-8' },
        body: injected,
      })
    })

    await page.goto(`${BASE}/app/offers`, { waitUntil: 'networkidle' })

    results.traderRowVisible = await page
      .locator('text=0xedge...test')
      .first()
      .isVisible()
      .catch(() => false)
    results.rowsRendered = (await page.locator('table tbody tr').count().catch(() => 0)) >= 1
    results.edgeNodeRemoved = (await page.locator('#__EDGE_DATA__').count()) === 0
    results.noStuckSkeleton = (await page.locator('[aria-busy="true"]').count()) === 0
    results.noOffersApiCall = offersApiCalls === 0
    results.noPageErrors = pageErrors.length === 0

    await browser.close()
    exitCode = Object.values(results).every(Boolean) ? 0 : 1
    console.log('edge-hydration results:', JSON.stringify(results, null, 2))
    console.log(
      `[INFO] console errors during run: ${consoleErrors.length} (RLS/anon 400/403, pre-existing)`,
    )
  } finally {
    if (ownServer && preview) preview.kill()
  }

  process.exit(exitCode)
}

main().catch((err) => {
  console.error('edge-hydration e2e failed to run:', err)
  process.exit(1)
})