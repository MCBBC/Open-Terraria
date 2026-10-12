// Waifu 原版材质包端到端实装探针(2026-10-12):
//   打包工坊目录→__swResourcePacks.importPack→启用→重放→进世界→截图 NPC 娘化
// 运行: SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_waifu-pack-probe.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201'
const WORKSHOP = process.env.HOME + '/Library/Application Support/Steam/steamapps/workshop/content/105600/3293723058'

// 目录→zip(探针侧打包;桌面壳由主进程路由承担)
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
console.log('[probe] 工坊包 zip:', Object.keys(files).length, '文件')

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error') errs.push('CON: ' + m.text().slice(0, 130)) })

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; }

await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 6000))
const imported = await page.evaluate(async (b64) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const mgr = window.__swResourcePacks
  if (!mgr) return { fail: 'no __swResourcePacks' }
  const row = await mgr.importPack(bytes, 'waifu-pack.zip')
  await mgr.setEnabled(row.id, true)
  return { id: row.id, name: row.name, fileCount: row.fileCount, rows: mgr.rows.length }
}, zipB64).catch((e) => ({ evalFail: String(e).slice(0, 160) }))
check('材质包导入+启用', !!imported?.id && imported.fileCount > 2000, JSON.stringify(imported))

// 重载验证持久化+启动恢复(资源包从存储回放应用)
await page.reload({ waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 14000))
const restored = await page.evaluate(() => {
  const mgr = window.__swResourcePacks
  return { rows: mgr?.rows?.map((r) => ({ n: r.name, on: r.enabled, files: r.fileCount })) ?? null }
})
check('重载后包恢复启用', (restored.rows ?? []).some((r) => r.on && r.files > 2000), JSON.stringify(restored.rows))

// 进世界截图(找向导 NPC——娘化包替换 NPC_22)
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 })
await new Promise((r) => setTimeout(r, 3000))
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'))
  btn?.click()
})
await new Promise((r) => setTimeout(r, 2500))
// 把向导拽到玩家屏内
const npcPos = await page.evaluate(() => {
  const g = window.__swGame
  const guide = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead)
  if (!guide) return null
  g.player.x = guide.x - 120; g.player.y = guide.y
  return { x: guide.x, y: guide.y }
})
console.log('[probe] 向导位置:', JSON.stringify(npcPos))
await new Promise((r) => setTimeout(r, 2200))
await page.screenshot({ path: 'shots/waifu-npc.png' })

// 采样本体区域像素(娘化贴图=高分辨率彩绘,原版=低分辨率像素;以分辨率差为信号:
// 娘化向导贴图 2x 宽度约 80px,原版 40px——采样在屏 guide 区域非空像素即可,视觉留给人工)
await page.evaluate(() => {
  const g = window.__swGame
  const guide = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead)
  if (guide) { g.player.x = guide.x - 120; g.player.y = guide.y }
})
await new Promise((r) => setTimeout(r, 1200))
const vis = await page.evaluate(() => {
  const g = window.__swGame
  const guide = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead)
  if (!guide) return { found: false }
  const [sx, sy] = g.camera.worldToScreen(guide.cx, guide.y + guide.h)
  const d = g.renderer.ctx.getImageData(Math.round(sx) - 40, Math.round(sy) - 60, 80, 60).data
  let npx = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 30) npx++
  return { found: true, cover: +(npx / (80 * 60)).toFixed(2) }
})
check('NPC 在屏渲染', vis.found === true && vis.cover > 0.08, JSON.stringify(vis))

// ---- 玩家本体换肤(登记债清偿验证):包分件 Player_0_* 双写 vanilla-ui →
//      PaperDoll 合成链吃新件 → 玩家立绘即娘化。截图 + 停走定格。 ----
await page.evaluate(() => {
  const g = window.__swGame
  g.player.vx = 0; g.player.vy = 0
})
await new Promise((r) => setTimeout(r, 700))
await page.screenshot({ path: 'shots/waifu-player.png' })
console.log('shots: shots/waifu-player.png')

console.log('shots: shots/waifu-npc.png')
console.log(`\n${pass} passed, ${fail} failed`)
if (errs.length) console.log('页面异常:', errs.slice(0, 4))
await browser.close()
process.exit(fail ? 1 : 0)
