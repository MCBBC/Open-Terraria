// 数据面终验:进世界后 vui 实际服务的 Player_0_0 = 原版还是包件(关玩家类别后)
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
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 })
await new Promise((r) => setTimeout(r, 6000))
await page.evaluate(async (b64) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const mgr = window.__swResourcePacks
  const row = await mgr.importPack(bytes, 'waifu-pack.zip')
  await mgr.setEnabled(row.id, true)
  // 立即关闭玩家类别(模拟用户关掉后再进世界)
  await mgr.setPackCategories(row.id, { player: false })
}, zipB64)
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 500 })
await new Promise((r) => setTimeout(r, 3000))
const verdict = await page.evaluate(async () => {
  const a = window.__swAtlas
  const KEY = 'vanilla-ui/Player_0_0.png'
  const bmp = a.uiimages.get(KEY)
  const orig = await createImageBitmap(await (await fetch('sprites/vanilla-ui/Player_0_0.png')).blob())
  const W = 40, H = 400
  const mk = (src, sw, sh) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const cx = c.getContext('2d')
    cx.imageSmoothingEnabled = false
    cx.drawImage(src, 0, 0, sw, sh, 0, 0, W, H)
    return cx.getImageData(0, 0, W, H).data
  }
  const x = mk(bmp, bmp.width, bmp.height)
  const y = mk(orig, orig.width, orig.height)
  let diff = 0
  for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) > 8 || Math.abs(x[i + 1] - y[i + 1]) > 8 || Math.abs(x[i + 2] - y[i + 2]) > 8) diff++
  // PaperDoll 实际会取的 sheet(变体链解析)
  const { variantSheetName } = await import('/src/player/PaperDoll.ts')
  const sheet = variantSheetName(0, 0, (n) => a.uiFileExists(n))
  return { sheet, sameAsOriginal: diff < W * H * 0.01, diffPct: +(diff / (W * H) * 100).toFixed(1) }
})
console.log('vui 服务面:', JSON.stringify(verdict))
console.log(verdict.sameAsOriginal ? 'PASS: 关玩家后 vui=原版(进世界应为原版皮肤)' : 'FAIL: vui 仍为包件')
await browser.close()
