// rivals v2 双 Boss 战斗探针:大体型/多段体节/移动积分/弹幕可见性/切相/掉落
// 运行: SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_rivals-probe.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201'
const b64 = (p) => Buffer.from(new Uint8Array(fs.readFileSync(p))).toString('base64')
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 180)))
page.on('console', (m) => { if (m.type() === 'error') errs.push('CON: ' + m.text().slice(0, 150)) })

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; }

await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 5000))
await page.evaluate(async (b64g, b64r) => {
  const put = async (b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return await window.__swMods.install(bytes)
  }
  await put(b64g)
  await put(b64r)
}, b64('mods/dist/glmgirl.swmod'), b64('mods/dist/rivals.swmod'))
await page.reload({ waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 9000))
const boot = await page.evaluate(() => {
  const r = window.__swMods?.result?.() ?? null
  return {
    loaded: r?.loaded?.map((m) => m.manifest.id) ?? null,
    errors: r?.errors ?? null,
    npcs: r?.allocation?.npcs ? Object.fromEntries(r.allocation.npcs) : null,
  }
})
check('双 mod 装载零错误', boot.loaded?.includes('rivals') && boot.loaded?.includes('glmgirl')
  && Array.isArray(boot.errors) && boot.errors.length === 0, JSON.stringify(boot.errors))
// npc 键字典序:claude < claude_claw < gpt < gpt_rune
const CLAUDE_ID = boot.npcs?.['mod_rivals_claude']
const CLAW_ID = boot.npcs?.['mod_rivals_claude_claw']
const GPT_ID = boot.npcs?.['mod_rivals_gpt']
const RUNE_ID = boot.npcs?.['mod_rivals_gpt_rune']
check('四体 id 分配(801-804)', CLAUDE_ID === 801 && CLAW_ID === 802 && GPT_ID === 803 && RUNE_ID === 804,
  JSON.stringify(boot.npcs))

await page.goto(ORIGIN + '/?play=small', { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 })
await new Promise((r) => setTimeout(r, 2500))
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'))
  btn?.click()
})
await new Promise((r) => setTimeout(r, 1000))

// ---- 召唤主体 ----
const summon = await page.evaluate(async (cId, gId) => {
  const g = window.__swGame
  g.debugSpawnNpc(cId, 1)
  g.debugSpawnNpc(gId, 1)
  await new Promise((r) => setTimeout(r, 1500))
  const c = g.entities.enemies.find((e) => e.vanillaId === cId)
  const gp = g.entities.enemies.find((e) => e.vanillaId === gId)
  return {
    c: c ? { w: c.w, h: c.h, hp: c.maxHp, x: c.x, y: c.y } : null,
    g: gp ? { w: gp.w, hp: gp.maxHp } : null,
  }
}, CLAUDE_ID, GPT_ID).catch((e) => ({ evalFail: String(e).slice(0, 160) }))
check('巨蟹实体化(170×110/hp6800)', summon.c?.w === 170 && summon.c?.h === 110 && summon.c?.hp === 6800,
  JSON.stringify(summon.c))
check('巨石实体化(120 宽/hp8200)', summon.g?.w === 120 && summon.g?.hp === 8200, JSON.stringify(summon.g))

// 玩家贴近 + 等体节派生与开火
await page.evaluate((cId) => {
  const g = window.__swGame
  const c = g.entities.enemies.find((e) => e.vanillaId === cId)
  if (c) { g.player.x = c.x - 200; g.player.y = c.y + 60 }
}, CLAUDE_ID)
await new Promise((r) => setTimeout(r, 6000))

// ---- 移动断言(位置积分生效) ----
const move = await page.evaluate(async (cId, gId) => {
  const g = window.__swGame
  const c = g.entities.enemies.find((e) => e.vanillaId === cId)
  const gp = g.entities.enemies.find((e) => e.vanillaId === gId)
  const p0 = c ? { x: c.x, y: c.y } : null
  const q0 = gp ? { x: gp.x, y: gp.y } : null
  await new Promise((r) => setTimeout(r, 2500))
  const p1 = c ? { x: c.x, y: c.y } : null
  const q1 = gp ? { x: gp.x, y: gp.y } : null
  const d = (a, b) => a && b ? Math.hypot(a.x - b.x, a.y - b.y) : -1
  return { crabMove: +(d(p0, p1)).toFixed(1), rockMove: +(d(q0, q1)).toFixed(1) }
}, CLAUDE_ID, GPT_ID).catch((e) => ({ evalFail: String(e).slice(0, 160) }))
check('巨蟹在移动(2.5s 位移>15px)', move.crabMove > 15, `${move.crabMove}px`)
check('巨石在移动(2.5s 位移>10px)', move.rockMove > 10, `${move.rockMove}px`)

// ---- 体节派生 ----
const segs = await page.evaluate((cId, clawId, gId, runeId) => {
  const g = window.__swGame
  return {
    claws: g.entities.enemies.filter((e) => e.vanillaId === clawId).length,
    runes: g.entities.enemies.filter((e) => e.vanillaId === runeId).length,
    headAlive: !!g.entities.enemies.find((e) => e.vanillaId === cId && !e.dead),
  }
}, CLAUDE_ID, CLAW_ID, GPT_ID, RUNE_ID)
check('巨螯体节×2 已派生', segs.claws === 2, JSON.stringify(segs))
check('符石卫队×4 已派生', segs.runes === 4, JSON.stringify(segs))

// ---- 弹幕发射 + 可见性(饱和像素) ----
const fire = await page.evaluate(async (cId, gId) => {
  const g = window.__swGame
  let modProjMax = 0
  let visPx = 0
  const seen = new Set()
  // 确定性渲染样本:冻结弹钉在玩家屏内(0 速/长寿命),逐帧采其中心
  const { ModProj } = await import('/src/entities/ModProj.ts')
  const fx = g.player.x + 70, fy = g.player.y - 30
  const frozen = new ModProj(fx, fy, 0, 0, 10, 2, 2002, true)
  g.entities.add(frozen, 'projectiles')
  for (let i = 0; i < 300; i++) {
    const projs = g.entities.projectiles.filter((p) => p.projId >= 2000)
    modProjMax = Math.max(modProjMax, projs.length)
    if (visPx < 10 && !frozen.dead) {
      // 冻结样本:世界坐标直绘后屏位 = worldToScreen(左上)+半宽
      const [sx, sy] = g.camera.worldToScreen(frozen.x, frozen.y)
      const mx = Math.round(sx + frozen.w / 2), my = Math.round(sy + frozen.h / 2)
      if (mx > 40 && my > 40 && mx < 1240 && my < 760) {
        const d = g.renderer.ctx.getImageData(mx - 12, my - 12, 24, 24).data
        for (let j = 0; j < d.length; j += 4) {
          const r = d[j], gg = d[j + 1], b = d[j + 2]
          if (Math.max(r, gg, b) - Math.min(r, gg, b) > 50) visPx++   // 高饱和=弹幕贴图像素
        }
      }
    }
    for (const q of projs) seen.add(`${q.projId}`)
    await new Promise((r) => setTimeout(r, 16))
  }
  return { modProjMax, kinds: [...seen].sort(), visPx }
}, CLAUDE_ID, GPT_ID).catch((e) => ({ evalFail: String(e).slice(0, 160) }))
check('mod 弹幕发射(峰值≥6)', (fire.modProjMax ?? 0) >= 6, `max=${fire.modProjMax} kinds=${JSON.stringify(fire.kinds)}`)
check('弹幕贴图可见(高饱和像素≥10)', (fire.visPx ?? 0) >= 10, `visPx=${fire.visPx}`)
check('弹幕种类≥4', (fire.kinds?.length ?? 0) >= 4, JSON.stringify(fire.kinds))

// ---- 压血切相 ----
const phase = await page.evaluate(async (cId, gId) => {
  const g = window.__swGame
  const c = g.entities.enemies.find((e) => e.vanillaId === cId)
  const gp = g.entities.enemies.find((e) => e.vanillaId === gId)
  if (c) c.life = Math.floor(c.maxHp * 0.4)
  if (gp) gp.life = Math.floor(gp.maxHp * 0.3)
  await new Promise((r) => setTimeout(r, 400))
  return { cp: c?.swPhase, gp3: gp?.swPhase }
}, CLAUDE_ID, GPT_ID).catch((e) => ({ evalFail: String(e).slice(0, 160) }))
check('巨蟹切相 P2', phase.cp === 2, JSON.stringify(phase))
check('巨石切相 P3', phase.gp3 === 3, JSON.stringify(phase))

// ---- 击杀掉落 ----
const kill = await page.evaluate(async (cId) => {
  const g = window.__swGame
  const c = g.entities.enemies.find((e) => e.vanillaId === cId)
  if (!c) return { found: false }
  const before = g.entities.drops ? g.entities.drops.length : 0
  c.hurt(99999, 0, 0, g)
  await new Promise((r) => setTimeout(r, 800))
  const items = (g.entities.drops ?? []).slice(before)
  return { found: true, dead: c.dead, drops: items.map((d) => ({ id: d.itemId ?? -1, stack: d.stack ?? 1 })) }
}, CLAUDE_ID).catch((e) => ({ evalFail: String(e).slice(0, 160) }))
check('击杀掉落星织核心(id 30000 段)', kill.dead === true && (kill.drops ?? []).some((d) => d.id >= 30000),
  JSON.stringify(kill.drops))

await page.screenshot({ path: 'shots/rivals-v2-fight.png' })
console.log('shots: shots/rivals-v2-fight.png')
console.log(`\n${pass} passed, ${fail} failed`)
if (errs.length) console.log('页面异常:', errs.slice(0, 4))
await browser.close()
process.exit(fail ? 1 : 0)
