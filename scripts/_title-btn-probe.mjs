import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') errs.push('CON: ' + m.text().slice(0, 180)) })
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 12000))
await page.evaluate(() => document.querySelector('[data-act=packs]')?.click())
await new Promise((r) => setTimeout(r, 1200))   // 动态 import 分块 + 构建
const r1 = await page.evaluate(() => {
  const wrap = document.querySelector('.sw-rp-wrap')
  const b = document.querySelector('.sw-rp-toolbar button')
  return { wrap: !!wrap, btnStyled: b ? getComputedStyle(b).backgroundColor : null }
})
console.log('page:', JSON.stringify(r1), 'errs:', JSON.stringify(errs.slice(0, 3)))
if (r1.wrap) await page.screenshot({ path: 'shots/title-packpage.png' })
console.log(r1.wrap && r1.btnStyled !== 'rgba(0, 0, 0, 0)' ? 'PASS' : 'FAIL')
await browser.close()
