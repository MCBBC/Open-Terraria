// 类别开关端到端:启用包→关 town→向导回原版→开 town→娘化回归;关 sfx→覆盖表清音效
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
page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)))
let pass = 0, fail = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++ }
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
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 })
await new Promise((r) => setTimeout(r, 2500))
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes('我已知晓')); b?.click() })
await new Promise((r) => setTimeout(r, 1200))
// 向导贴图采样:基准(娘化)→关 town→原版→开→娘化
const probeGuide = () => page.evaluate(async () => {
  // 权威信号:注入位图 vs 原版磁盘文件【逐像素内容比对】(向导走动/光照会污染
  // 屏幕采样;restore 后键在位但内容=原版,在位性非二值)
  const bmp = window.__swAtlas?.vimages?.get?.('vanilla/Guide_Default.png')
  if (!bmp) return { present: false, same: true }
  const origBmp = await createImageBitmap(await (await fetch('sprites/vanilla/Guide_Default.png')).blob())
  const W = Math.min(bmp.width, 40), H = Math.min(bmp.height, 400)
  const mk = (src, sw, sh) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const cx = c.getContext('2d')
    cx.imageSmoothingEnabled = false
    cx.drawImage(src, 0, 0, sw, sh, 0, 0, W, H)
    return cx.getImageData(0, 0, W, H).data
  }
  const a = mk(bmp, bmp.width, bmp.height)
  const b = mk(origBmp, origBmp.width, origBmp.height)
  let diff = 0
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) > 8 || Math.abs(a[i + 1] - b[i + 1]) > 8 || Math.abs(a[i + 2] - b[i + 2]) > 8) diff++
  }
  return { present: true, same: diff < W * H * 0.01, diffPct: +(diff / (W * H) * 100).toFixed(1) }
})
await page.evaluate(() => { const g = window.__swGame; const gd = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead); if (gd) { g.player.x = gd.x - 100; g.player.y = gd.y } })
await new Promise((r) => setTimeout(r, 1500))
const base = await probeGuide()
console.log('[probe] 基准:', JSON.stringify(base))
const mgr = await page.evaluate(async (id) => {
  const mgr = window.__swResourcePacks
  await mgr.setPackCategories(id, { town: false })
  return mgr.rows.find((r) => r.id === id)?.categories
}, rowId)
await new Promise((r) => setTimeout(r, 1500))
const off = await probeGuide()
await page.evaluate(async (id) => { await window.__swResourcePacks.setPackCategories(id, { town: true }) }, rowId)
await new Promise((r) => setTimeout(r, 1500))
const on = await probeGuide()
console.log('sat: 基准', base.sat, '关town', off.sat, '开town', on.sat)
check('关 town 后本体回原版(内容=原版文件)', base.same === false && off.same === true, JSON.stringify({ base: base.same, off: off.same, dOff: off.diffPct }))
check('重开 town 后娘化回归(内容≠原版)', on.same === false, JSON.stringify({ on: on.same, dOn: on.diffPct }))
// 音效开关:关 sfx → override 清
const sfx = await page.evaluate(async (id) => {
  const { sfxPackOverrideKeys } = await import('/src/core/Sfx.ts')
  const before = sfxPackOverrideKeys().length
  await window.__swResourcePacks.setPackCategories(id, { town: true, sfx: false })
  const after = sfxPackOverrideKeys().length
  await window.__swResourcePacks.setPackCategories(id, {})
  const restored = sfxPackOverrideKeys().length
  return { before, after, restored }
}, rowId)
check('关 sfx → 音效覆盖清空/恢复', sfx.before === 19 && sfx.after === 0 && sfx.restored === 19, JSON.stringify(sfx))
// ---- 持久化核验:刷新后类别开关留存 ----
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 4000))
const persist = await page.evaluate((id) => {
  const mgr = window.__swResourcePacks
  const row = mgr?.rows?.find((r) => r.id === id)
  return { cats: row?.categories ?? null }
}, rowId)
check('刷新后类别开关持久', persist.cats && Object.keys(persist.cats).length > 0, JSON.stringify(persist.cats))
console.log('持久化:', JSON.stringify(persist.cats))

console.log(`\n${pass} passed, ${fail} failed`)
if (errs.length) console.log('页面异常:', errs.slice(0, 3))
await browser.close()
process.exit(fail ? 1 : 0)
