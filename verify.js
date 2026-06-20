import puppeteer from 'puppeteer'

(async () => {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })

  page.on('pageerror', err => {
    errors.push(err.toString())
  })

  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' })
  await page.waitForTimeout(3000)

  await browser.close()

  if (errors.length > 0) {
    console.error('CONSOLE ERRORS:')
    errors.forEach(e => console.error(e))
    process.exit(1)
  } else {
    console.log('✅ NO ERRORS - PAGE LOADED')
    process.exit(0)
  }
})()
