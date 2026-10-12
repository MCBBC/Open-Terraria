// 齿轮开合核验:默认关→点开→再点关→再点开(三态循环)
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201'
const WORKSHOP = process.env.HOME + '/Library/Application Support/Steam/steamapps/workshop/content/105600/3293723058'
const files = {}
function walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) walk(p, r)
    else if (e.name.toLowerCase() === 'pack.json') files[r] = strToU8(fs.readFileSync(p, 'utf8'))
    else if (r.toLowerCase() === 'icon.png' || r.toLowerCase().startsWith('content/')) files[r] = new Uint8Array(fs.readFileSync(p))
  }
}
walk(WORKSHOP)
const zipB64 = Buffer.from(zipSync(files, { level: 0 })).toString('base64')
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 6000))
await page.evaluate(async (b64) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const mgr = window.__swResourcePacks
  const row = await mgr.importPack(bytes, 'waifu-pack.zip')
  await mgr.setEnabled(row.id, true)
}, zipB64)
// 打开材质包页
await page.evaluate(() => document.querySelector('[data-act=packs]')?.click())
await new Promise((r) => setTimeout(r, 800))
const state = () => page.evaluate(() => ({
  open: !!document.querySelector('.sw-rp-row > .sw-rp-cats'),
  cats: document.querySelectorAll('.sw-rp-cats .sw-rp-cat').length,
}))
let s = await state()
console.log('初始(期望关):', JSON.stringify(s))
const pass1 = s.open === false
await page.evaluate(() => { const b = [...document.querySelectorAll('.sw-rp-btns button')].find((x) => x.textContent === '⚙'); b?.click() })
s = await state()
console.log('点⚙后(期望开):', JSON.stringify(s))
const pass2 = s.open === true && s.cats > 0
await page.evaluate(() => { const b = [...document.querySelectorAll('.sw-rp-btns button')].find((x) => x.textContent === '⚙'); b?.click() })
s = await state()
console.log('再点⚙(期望关):', JSON.stringify(s))
const pass3 = s.open === false
await page.evaluate(() => { const b = [...document.querySelectorAll('.sw-rp-btns button')].find((x) => x.textContent === '⚙'); b?.click() })
s = await state()
console.log('三次点⚙(期望再开):', JSON.stringify(s))
const pass4 = s.open === true && s.cats > 0
await page.screenshot({ path: 'shots/rp-gear.png' })
console.log(`\n${[pass1, pass2, pass3, pass4].filter(Boolean).length}/4 passed`)
await browser.close()
process.exit([pass1, pass2, pass3, pass4].every(Boolean) ? 0 : 1)
