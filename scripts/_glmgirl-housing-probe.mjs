// GLM娘 住房分配 + 缺mod读档守卫 专项探针(2026-10-04 用户实报两bug复核):
//   ① 卸载 mod 后读档,存档遗留 NPC 走 ctor ??22 兜底=变身向导 → townNpcKeyRestorable
//      守卫丢弃(tML 同款移除语义)
//   ② 住房分配链:面板行(housingHeadRows)→ housingAssign 建房实测
// 运行: SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_glmgirl-housing-probe.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201'
const b64 = Buffer.from(new Uint8Array(fs.readFileSync('mods/dist/glmgirl.swmod'))).toString('base64')
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 160)))

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; }

// 装包(独立浏览器=全新存储,必须先装)→reload→进世界
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 5000))
await page.evaluate(async (b64) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return await window.__swMods.install(bytes)
}, b64)
await page.reload({ waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 8000))
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 })
await new Promise((r) => setTimeout(r, 2500))
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'))
  btn?.click()
})
await new Promise((r) => setTimeout(r, 1000))

// ---- ① 面板行可见性 ----
const row = await page.evaluate(async () => {
  const g = window.__swGame
  g.debugSpawnNpc(800, 1)
  await new Promise((r) => setTimeout(r, 600))
  const { housingHeadRows } = await import('/src/ui/HousingPanel.ts')
  const rows = housingHeadRows(g)
  return {
    rows: rows.map((r) => `${r.headIndex}:${r.npcKey}`),
    hasGlm: rows.some((r) => r.npcKey === 'mod_glmgirl_glm_girl'),
  }
}).catch((e) => ({ evalFail: String(e).slice(0, 160) }))
check('住房面板行含 GLM娘', row.hasGlm === true, JSON.stringify(row.rows))

// ---- ② 建标准房 + housingAssign 实测(_bj259 房建范式) ----
const assign = await page.evaluate(async () => {
  const g = window.__swGame
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts')
  const st = g.world.store
  const T = TILE_BY_KEY
  const ox = Math.max(20, Math.floor(g.player.x / 16) + 6)
  const oy = Math.max(20, Math.floor(g.player.y / 16) - 9)
  const box = (x, y, t, fx = 0, fy = 0) => st.setTileSilent(x, y, t, fx, fy)
  for (let x = ox; x <= ox + 10; x++) { box(x, oy, T.wood); box(x, oy + 5, T.wood) }
  for (let y = oy + 1; y <= oy + 4; y++) { box(ox, y, T.wood); box(ox + 10, y, T.wood) }
  for (let y = oy + 1; y <= oy + 4; y++) for (let x = ox + 1; x <= ox + 9; x++) {
    st.wall[st.idx(x, y)] = 4
    if (st.type[st.idx(x, y)] !== 0 || st.type[st.idx(x, y)] === T.wood) st.setTileSilent(x, y, 0, 0, 0)
  }
  for (const dx of [ox, ox + 10]) for (let y = oy + 2; y <= oy + 4; y++) box(dx, y, 17, 0, (y - oy - 2) * 18)
  box(ox + 1, oy + 1, T.torch, 22, 0); box(ox + 9, oy + 1, T.torch, 44, 0); box(ox + 6, oy + 2, T.torch, 0, 0)
  box(ox + 4, oy + 3, T.chair); box(ox + 4, oy + 4, T.chair, 0, 18)
  for (let dx = 0; dx <= 2; dx++) { box(ox + 5 + dx, oy + 3, T.table, dx * 18, 0); box(ox + 5 + dx, oy + 4, T.table, dx * 18, 18) }
  const ok = g.housingAssign(ox + 5, oy + 4, 'mod_glmgirl_glm_girl')
  const n = g.entities.npcs.find((e) => e.vanillaId === 800)
  return { ok, home: n?.home ?? null, standX: ox + 5, standY: oy + 4 }
}).catch((e) => ({ evalFail: String(e).slice(0, 160) }))
check('housingAssign 受理', assign.ok === true, JSON.stringify(assign))
check('home 落位=房内站立格', assign.ok === true
  && assign.home?.x === assign.standX && assign.home?.y === assign.standY, JSON.stringify(assign.home))

// ---- ③ 缺 mod 读档守卫(降级语义) ----
const guard = await page.evaluate(async () => {
  const { townNpcKeyRestorable } = await import('/src/data/vanillaNpcs.ts')
  return {
    glmLoaded: townNpcKeyRestorable('mod_glmgirl_glm_girl'),   // mod 在=可重建
    guide: townNpcKeyRestorable('guide'),                      // vanilla 恒 true
    gone: townNpcKeyRestorable('mod_someone_else_cool'),       // 未注册 mod key=false
  }
}).catch((e) => ({ evalFail: String(e).slice(0, 160) }))
check('restorable 守卫三态(mod在/vanilla/缺mod)',
  guard.glmLoaded === true && guard.guide === true && guard.gone === false, JSON.stringify(guard))

console.log(`\n${pass} passed, ${fail} failed`)
if (errs.length) console.log('页面异常:', errs.slice(0, 3))
await browser.close()
process.exit(fail ? 1 : 0)
