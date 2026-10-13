// 用户流程完整复现:启用→进世界(验娘化)→退标题→关玩家类别→再进世界(验原版)
// 导航挂起对策:beforeunload 对话框自动接受;world 就绪用 waitForFunction 轮询
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
page.on('dialog', (d) => { d.accept().catch(() => {}) })
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 })
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
const enterWorld = async () => {
  await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 500 })
  await new Promise((r) => setTimeout(r, 2500))
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes('我已知晓')); b?.click() })
  await new Promise((r) => setTimeout(r, 1500))
}
// 玩家头部采样(发顶像素=发色判别:娘化白发 vs 原版棕发),8× 放大截图
const shotPlayer = async (tag) => page.evaluate((tag) => {
  const g = window.__swGame
  const p = g.player
  const [sx, sy] = g.camera.worldToScreen(p.cx, p.y + p.h)
  // renderer ctx 直采(实体循环同坐标系;此前用主画布 CSS 坐标错位=采空)
  const d = g.renderer.ctx.getImageData(Math.round(sx) - 20, Math.round(sy) - 52, 40, 52).data
  let n = 0, rs = 0, gs = 0, bs = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 30) { n++; rs += d[i]; gs += d[i + 1]; bs += d[i + 2] }
  }
  return { n, hair: n ? [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)] : null }
}, tag).then((r) => { console.log(`[${tag}] 屏区不透明px:`, r.n, '均色:', JSON.stringify(r.hair)); return r })
await enterWorld()
const hair1 = await shotPlayer('w1')
// 退标题 → 关玩家
await page.evaluate(() => { const g = window.__swGame; g.quitToMenu?.() })
await new Promise((r) => setTimeout(r, 3000))
await page.evaluate(async (id) => { await window.__swResourcePacks.setPackCategories(id, { player: false }) }, rowId)
await new Promise((r) => setTimeout(r, 1500))
await enterWorld()
const hair2 = await shotPlayer('w2')
const waifu = (h) => h && h[0] > 180 && h[0] > h[1] + 20   // 白/银发高R低G
console.log(`w1 娘化(白发): ${!!waifu(hair1)}  w2 关后仍娘化: ${!!waifu(hair2)}  hair1=${JSON.stringify(hair1)} hair2=${JSON.stringify(hair2)}`)
if (errs.length) console.log('页面异常:', errs.slice(0, 3))
await browser.close()
