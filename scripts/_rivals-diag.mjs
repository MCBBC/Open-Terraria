// rivals 掉落 id 诊断:分配表/键映射/规则域三查
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201'
const b64 = (p) => Buffer.from(new Uint8Array(fs.readFileSync(p))).toString('base64')
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 5000))
await page.evaluate(async (b64r) => {
  const bin = atob(b64r)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return await window.__swMods.install(bytes)
}, b64('mods/dist/rivals.swmod'))
await page.reload({ waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 9000))
const diag = await page.evaluate(async () => {
  const { ITEM_BY_KEY, ITEM_DEFS } = await import('/src/data/items.ts')
  const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts')
  return {
    byKey: ITEM_BY_KEY['mod_rivals_claude_core'],
    defs30000: ITEM_DEFS[30000]?.key ?? null,
    defs243: ITEM_DEFS[243]?.key ?? null,
    vanilla30000: VANILLA_ITEM_KEY_BY_ID[30000] ?? null,
    vanilla243: VANILLA_ITEM_KEY_BY_ID[243] ?? null,
    defsLen: ITEM_DEFS.length,
  }
}).catch((e) => ({ evalFail: String(e).slice(0, 200) }))
console.log('DIAG:', JSON.stringify(diag))
await browser.close()
