// 玩家类别关闭链取证:启用→快照 uiimages 玩家件→关 player→再快照(vs 原版逐像素)
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
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)))
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 6000))
const rowId = await page.evaluate(async (b64) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const mgr = window.__swResourcePacks
  const row = await mgr.importPack(bytes, 'waifu-pack.zip')
  await mgr.setEnabled(row.id, true)
  return row.id
}, zipB64)
// 快照器:uiimages 玩家件 vs 原版文件逐像素
const snap = () => page.evaluate(async () => {
  const a = window.__swAtlas
  const KEY = 'vanilla-ui/Player_0_0.png'
  const bmp = a.uiimages.get(KEY)
  if (!bmp) return { present: false }
  const origBmp = await createImageBitmap(await (await fetch('sprites/vanilla-ui/Player_0_0.png')).blob())
  const W = Math.min(bmp.width, 40), H = Math.min(bmp.height, 400)
  const mk = (src, sw, sh) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const cx = c.getContext('2d')
    cx.imageSmoothingEnabled = false
    cx.drawImage(src, 0, 0, sw, sh, 0, 0, W, H)
    return cx.getImageData(0, 0, W, H).data
  }
  const x = mk(bmp, bmp.width, bmp.height)
  const y = mk(origBmp, origBmp.width, origBmp.height)
  let diff = 0
  for (let i = 0; i < x.length; i += 4) {
    if (Math.abs(x[i] - y[i]) > 8 || Math.abs(x[i + 1] - y[i + 1]) > 8 || Math.abs(x[i + 2] - y[i + 2]) > 8) diff++
  }
  return { present: true, sameAsOriginal: diff < W * H * 0.01, diffPct: +(diff / (W * H) * 100).toFixed(1) }
})
const s1 = await snap()
console.log('启用后:', JSON.stringify(s1))
await page.evaluate(async (id) => { await window.__swResourcePacks.setPackCategories(id, { player: false }) }, rowId)
await new Promise((r) => setTimeout(r, 2500))
const s2 = await snap()
console.log('关玩家后:', JSON.stringify(s2))
check = (n, ok, e = '') => console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}  ${e}`)
check('启用后=包件(≠原版)', s1.present && s1.sameAsOriginal === false, JSON.stringify(s1))
check('关玩家后=原版(逐像素相等)', s2.present && s2.sameAsOriginal === true, JSON.stringify(s2))
if (errs.length) console.log('页面异常:', errs.slice(0, 3))
await browser.close()
