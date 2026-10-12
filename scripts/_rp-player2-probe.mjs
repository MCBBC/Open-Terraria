// 复现用户流程:启用→进世界(截图玩家)→退出→关玩家→再进世界(截图玩家)→对比
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
// 第一次进世界
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 })
await new Promise((r) => setTimeout(r, 2500))
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes('我已知晓')); b?.click() })
await new Promise((r) => setTimeout(r, 1200))
const shotPlayer = () => page.evaluate(() => {
  const g = window.__swGame
  const p = g.player
  const [sx, sy] = g.camera.worldToScreen(p.cx, p.y + p.h)
  const c = document.createElement('canvas'); c.width = 48; c.height = 64
  const cx = c.getContext('2d')
  cx.imageSmoothingEnabled = false
  const main = document.querySelector('canvas')
  cx.drawImage(main, Math.round(sx) - 24, Math.round(sy) - 56, 48, 64, 0, 0, 48, 64)
  return c.toDataURL('image/png')
})
const shot1 = await shotPlayer()
fs.writeFileSync('/tmp/player-world1.png', Buffer.from(shot1.split(',')[1], 'base64'))
// 退回标题 → 关玩家 → 再进世界
await page.evaluate(() => { const g = window.__swGame; g.quitToMenu?.() })
await new Promise((r) => setTimeout(r, 2500))
await page.evaluate(async (id) => {
  // 打开材质包页并关闭玩家类别(绕 UI 直调,语义同 ⚙ 勾选)
  await window.__swResourcePacks.setPackCategories(id, { player: false })
}, rowId)
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 })
await new Promise((r) => setTimeout(r, 2500))
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes('我已知晓')); b?.click() })
await new Promise((r) => setTimeout(r, 1200))
const shot2 = await shotPlayer()
fs.writeFileSync('/tmp/player-world2.png', Buffer.from(shot2.split(',')[1], 'base64'))
// 对比两图
const same = shot1 === shot2
console.log('两次玩家绘制一致:', same, same ? '→ 玩家仍被应用材质(BUG)' : '→ 已回原版(修复生效)')
// uiimages 内容核验
const ui = await page.evaluate(async () => {
  const a = window.__swAtlas
  const bmp = a.uiimages.get('vanilla-ui/Player_0_0.png')
  if (!bmp) return { present: false }
  const orig = await createImageBitmap(await (await fetch('sprites/vanilla-ui/Player_0_0.png')).blob())
  const W = 40, H = 400
  const mk = (src, sw, sh) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false; cx.drawImage(src, 0, 0, sw, sh, 0, 0, W, H); return cx.getImageData(0, 0, W, H).data }
  const x = mk(bmp, bmp.width, bmp.height), y = mk(orig, orig.width, orig.height)
  let diff = 0
  for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) > 8 || Math.abs(x[i + 1] - y[i + 1]) > 8 || Math.abs(x[i + 2] - y[i + 2]) > 8) diff++
  return { present: true, sameAsOriginal: diff < W * H * 0.01, diffPct: +(diff / (W * H) * 100).toFixed(1) }
})
console.log('uiimages 玩家件:', JSON.stringify(ui))
if (errs.length) console.log('页面异常:', errs.slice(0, 3))
await browser.close()
