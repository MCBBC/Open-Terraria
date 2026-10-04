// GLM娘 mod 城镇NPC 全链探针(2026-10-04 实验批):
//   装包→reload→装载结果/id分配→进世界→debugSpawnNpc(801)→实体化(TownNPC)/
//   帧行走(2..15不越界)/渲染采样/头贴索引/对话池/入驻链垫底/存档键
// 运行: SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_glmgirl-mod-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199'
const ZIP = new Uint8Array(fs.readFileSync('mods/dist/glmgirl.swmod'))
const b64 = Buffer.from(ZIP).toString('base64')

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') errs.push('CON: ' + m.text().slice(0, 160)) })

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; }

// ---- ① 标题页装包 → reload → 装载结果 ----
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 6000))
const inst = await page.evaluate(async (b64) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return await window.__swMods.install(bytes)
}, b64).catch((e) => ({ evalFail: String(e).slice(0, 150) }))
check('mod 安装入存储', !!inst?.id, JSON.stringify(inst).slice(0, 120))

await page.reload({ waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 9000))
const boot = await page.evaluate(() => {
  const r = window.__swMods?.result?.() ?? null
  return {
    loaded: r?.loaded?.map((m) => ({ id: m.manifest.id, counts: m.counts })) ?? null,
    errors: r?.errors ?? null,
    npcAlloc: r?.allocation?.npcs ? Object.fromEntries(r.allocation.npcs) : null,
  }
}).catch((e) => ({ evalFail: String(e).slice(0, 150) }))
check('mod 装载成功(npcs=1)', boot.loaded?.some((m) => m.id === 'glmgirl' && m.counts.npcs === 1), JSON.stringify(boot.loaded))
check('装载零错误', Array.isArray(boot.errors) && boot.errors.length === 0, JSON.stringify(boot.errors))
const NPC_ID = boot.npcAlloc?.['mod_glmgirl_glm_girl']
// 设计文档「NPC id:800 起」= 首个即 800(MOD_NPC_ID_BASE + 分配前 size)
check('id 分配 800 段首位', NPC_ID === 800, `allocated=${NPC_ID}`)

// ---- ② ?play=small 进世界 ----
const page2 = await browser.newPage()
page2.on('pageerror', (e) => errs.push('P2 PAGEERR: ' + String(e).slice(0, 200)))
await page2.goto(ORIGIN + '/?play=small', { waitUntil: 'networkidle2', timeout: 90000 })
await page2.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 })
await new Promise((r) => setTimeout(r, 2500))
// 摘欢迎覆层(WelcomeAnnounce 单例;不 ack 会盖住一切截图/交互)
await page2.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'))
  btn?.click()
})
await new Promise((r) => setTimeout(r, 1200))
// 拨到白昼(可写则拨;失败不阻断——仅影响截图观感)
await page2.evaluate(() => {
  try {
    const c = window.__swGame.world.clock
    if (c && typeof c.timeOfDay === 'number') c.timeOfDay = 0.3
  } catch { /* 只读钟面照走 */ }
})

// ---- ③ 实体化:debugSpawnNpc(801) → TownNPC 载体 ----
const spawn = await page2.evaluate(async (id) => {
  const g = window.__swGame
  g.debugSpawnNpc(id, 1)
  await new Promise((r) => setTimeout(r, 800))
  const n = g.entities.npcs.find((e) => e.vanillaId === id)
  if (!n) return { found: false, keys: g.entities.npcs.map((e) => `${e.npcKey}:${e.vanillaId}`) }
  return {
    found: true,
    ctor: n.constructor.name,
    key: n.npcKey, w: n.w, h: n.h, hp: n.hp, maxHp: n.maxHp,
    x: Math.round(n.x), y: Math.round(n.y),
  }
}, NPC_ID).catch((e) => ({ evalFail: String(e).slice(0, 200) }))
check('实体化为 TownNPC(非 Enemy)', spawn.ctor === 'TownNPC', JSON.stringify(spawn))
check('key/碰撞盒/生命来自 mod def', spawn.key === 'mod_glmgirl_glm_girl' && spawn.w === 18 && spawn.h === 40 && spawn.maxHp === 250,
  `key=${spawn.key} ${spawn.w}x${spawn.h} hp=${spawn.maxHp}`)

// ---- ④ 行走帧:2..15 区间推进,不卷入坐姿/攻击带 ----
const walk = await page2.evaluate(async (id) => {
  const g = window.__swGame
  const n = g.entities.npcs.find((e) => e.vanillaId === id)
  n.setWalking(99999)
  const seen = new Set()
  for (let i = 0; i < 180; i++) {
    g.fixedUpdate(1 / 60)
    seen.add(n.frame)
    await new Promise((r) => setTimeout(r, 6))
  }
  return { frames: [...seen].sort((a, b) => a - b) }
}, NPC_ID).catch((e) => ({ evalFail: String(e).slice(0, 200) }))
const wf = walk.frames ?? []
// 帧1=腾空(下坡/越障的合法物理帧)、帧0=被逼停合法——硬判据=永不越 15 上界
// (15 以上是 social/坐姿/攻击带,卷入即帧表错位)+ 行走带确实推进
check('行走帧不越界(≤15)且带内推进', wf.length >= 4 && Math.max(...wf) <= 15 && wf.filter((f) => f >= 2).length >= 4,
  `frames=${wf.join(',')}`)
// 行走连拍(节奏观感核对:hold 降频后极端姿势交替应明显放缓)
await page2.evaluate((id) => {
  const g = window.__swGame
  const n = g.entities.npcs.find((e) => e.vanillaId === id)
  g.player.x = n.x - 90; g.player.y = n.y
}, NPC_ID)
for (let s = 0; s < 3; s++) {
  await page2.screenshot({ path: `shots/glmgirl-walk-${s}.png` })
  await new Promise((r) => setTimeout(r, 350))
}

// ---- ⑤ 渲染采样:40×56 区域非空像素 ----
await page2.evaluate((id) => {
  const g = window.__swGame
  const n = g.entities.npcs.find((e) => e.vanillaId === id)
  n.setStanding(99999)
  g.player.x = n.x - 80; g.player.y = n.y
}, NPC_ID)
await new Promise((r) => setTimeout(r, 2500))
const cover = await page2.evaluate((id) => {
  const g = window.__swGame
  const n = g.entities.npcs.find((e) => e.vanillaId === id)
  const [sx, sy] = g.camera.worldToScreen(n.cx, n.y + n.h)
  if (sx < 60 || sy < 80) return { off: true, sx, sy }
  const d = g.renderer.ctx.getImageData(Math.round(sx) - 20, Math.round(sy) - 56, 40, 56).data
  let npx = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 30) npx++
  return { cover: +(npx / (d.length / 4)).toFixed(2), sx: Math.round(sx), sy: Math.round(sy) }
}, NPC_ID).catch((e) => ({ evalFail: String(e).slice(0, 200) }))
check('mod 贴图条渲染可见', cover.cover > 0.08, JSON.stringify(cover))
await page2.screenshot({ path: 'shots/glmgirl-idle.png' })

// ---- ⑥ 头贴链:索引 54 + 注入图可取 ----
const head = await page2.evaluate(async (id) => {
  const { modTownNpcHeadIndex } = await import('/src/data/vanillaNpcs.ts')
  const idx = modTownNpcHeadIndex(id)
  const g = window.__swGame
  const atlas = g.renderer?.atlas ?? g.atlas ?? null
  const img = atlas?.vmisc?.(`vanilla/NPC_Head_${idx}.png`) ?? null
  return { idx, injected: !!img, w: img?.sw ?? 0, h: img?.sh ?? 0 }
}, NPC_ID).catch((e) => ({ evalFail: String(e).slice(0, 200) }))
check('头贴索引=54 且贴图已注入', head.idx === 54 && head.injected === true, JSON.stringify(head))

// ---- ⑦ 对话池:GLM 台词(非兜底'……') + 随机多句 ----
// 诊断位:G5 合并是否落表(不判定,只报告)
const diag = await page2.evaluate(() => {
  return import('/src/i18n/Lang.ts').then(({ Lang }) => ({
    has1: Lang.has('Mods.glmgirl.TownChat.1'),
    has8: Lang.has('Mods.glmgirl.TownChat.8'),
    t1: Lang.has('Mods.glmgirl.TownChat.1') ? Lang.text('Mods.glmgirl.TownChat.1').slice(0, 30) : null,
  }))
}).catch((e) => ({ evalFail: String(e).slice(0, 150) }))
console.log('G5诊断:', JSON.stringify(diag))

const chat = await page2.evaluate(async (id) => {
  const g = window.__swGame
  const n = g.entities.npcs.find((e) => e.vanillaId === id)
  const seen = new Set()
  for (let i = 0; i < 24; i++) {
    g.openNpcDialog(n)
    const t = document.querySelector('.sw-npc-dialog')?.textContent ?? ''
    seen.add(t.replace(/\s+/g, ' ').slice(0, 80))
    g.closeNpcDialog?.()
    await new Promise((r) => setTimeout(r, 30))
  }
  return { lines: [...seen] }
}, NPC_ID).catch((e) => ({ evalFail: String(e).slice(0, 200) }))
const lines = (chat.lines ?? []).filter((t) => t.length > 0)
check('对话来自 mod 池(非兜底)', lines.length > 0 && !lines.every((t) => t.includes('……')),
  JSON.stringify(lines.slice(0, 2)))
check('对话池随机(≥4 句)', new Set(lines).size >= 4, `${new Set(lines).size} 句`)
await page2.evaluate((id) => {
  const g = window.__swGame
  const n = g.entities.npcs.find((e) => e.vanillaId === id)
  g.openNpcDialog(n)
}, NPC_ID)
await new Promise((r) => setTimeout(r, 600))
await page2.screenshot({ path: 'shots/glmgirl-dialog.png' })

// ---- ⑧ 入驻链垫底 + 存档键 ----
const chain = await page2.evaluate(async () => {
  const { modTownArrivalEntries } = await import('/src/data/vanillaNpcs.ts')
  const g = window.__swGame
  const entries = modTownArrivalEntries((k) => g.entities.npcs.some((n) => n.npcKey === k))
  let arrivalOk = true
  try { g.updateTownNpcArrival() } catch (e) { arrivalOk = String(e).slice(0, 100) }
  const saveRec = g.townNpcsForSave?.().find((s) => String(s.key ?? '').includes('glmgirl')) ?? null
  return { entries, arrivalOk, saveRec: saveRec ? { key: saveRec.key, id: saveRec.id ?? saveRec.vanillaId } : null }
}).catch((e) => ({ evalFail: String(e).slice(0, 200) }))
check('入驻链含 mod 候选(垫底)', (chain.entries ?? []).some(([k]) => k === 'mod_glmgirl_glm_girl'),
  JSON.stringify(chain.entries))
check('入驻轮无异常', chain.arrivalOk === true, JSON.stringify(chain.arrivalOk))
check('存档按 npcKey 序列化', !!chain.saveRec, JSON.stringify(chain.saveRec))

// ---- ⑨ F6 召唤面板:mod 条目三路可见(空查询插队/id/名称) ----
const f6 = await page2.evaluate(async () => {
  const { filterSummonEntries } = await import('/src/core/DebugSummonPanel.ts')
  const empty = filterSummonEntries('')
  return {
    inEmpty: empty.some((e) => e.id === 800 && e.mod && e.town),
    top: empty.slice(0, 10).map((e) => `${e.id}${e.mod ? 'M' : ''}${e.boss ? 'B' : ''}`),
    byId: filterSummonEntries('800').some((e) => e.id === 800),
    byName: filterSummonEntries('GLM').some((e) => e.id === 800),
  }
}).catch((e) => ({ evalFail: String(e).slice(0, 200) }))
check('F6 面板三路可见(空查询/id/GLM)', f6.inEmpty === true && f6.byId === true && f6.byName === true,
  JSON.stringify(f6))

// ---- ⑩ 登记债补齐三断言(G6 头像/入驻条件面/$变体键) ----
const debts = await page2.evaluate(async (id) => {
  const out = {}
  // G6:Detailed 头像 blob url 已登记 + portraitForNpc 命中
  const { portraitForNpc, modPortraitUrl } = await import('/src/data/npcPortraits.ts')
  out.portraitUrl = modPortraitUrl(id)
  out.portraitHit = portraitForNpc({ vanillaId: id }) === out.portraitUrl && !!out.portraitUrl
    && String(out.portraitUrl).startsWith('blob:')
  // 入驻条件面:合成注册一只带 minTownNpcs=99 的 mod 城镇 NPC(id 802 空段),
  // 当前在场数 << 99 → 必 false;minTownNpcs=1 → true
  const { registerModTownNpc, modTownArrivalEntries } = await import('/src/data/vanillaNpcs.ts')
  registerModTownNpc('mod_testx_cond', 802, 10, 'testx', { minTownNpcs: 99 })
  const g = window.__swGame
  const n = g.entities.npcs.filter((e) => e.npcKey).length
  const gate = modTownArrivalEntries(() => false, {
    townNpcCount: n, hasKey: () => false, flag: () => false,
  })
  out.condBlocked = gate.find(([k]) => k === 'mod_testx_cond')?.[1] === false
  registerModTownNpc('mod_testx_cond', 802, 10, 'testx', { minTownNpcs: 1 })
  const gate2 = modTownArrivalEntries(() => false, {
    townNpcCount: n, hasKey: () => false, flag: () => false,
  })
  out.condPassed = gate2.find(([k]) => k === 'mod_testx_cond')?.[1] === true
  // 无条件候选(GLM娘)不受语境缺省影响
  out.unconditional = gate.find(([k]) => k === 'mod_glmgirl_glm_girl')?.[1] === true
  // $变体键:overlay 进 variations 后 tryGetVariation 可取
  const { languageManager } = await import('/src/i18n/LanguageManager.ts')
  languageManager.mergeModLangPack({
    'zh-Hans': { 'Mods.testx.Var': { 'greet$1': '变体一号', 'greet$2': '变体二号' } },
  })
  out.var1 = languageManager.tryGetVariation('Mods.testx.Var.greet', '1') === '变体一号'
  out.var2 = languageManager.tryGetVariation('Mods.testx.Var.greet', '2') === '变体二号'
  return out
}, NPC_ID).catch((e) => ({ evalFail: String(e).slice(0, 200) }))
check('G6 对话头像 blob url 登记+命中', debts.portraitHit === true, String(debts.portraitUrl).slice(0, 60))
check('入驻条件面门控(99阻断/1放行/无条件不受扰)',
  debts.condBlocked === true && debts.condPassed === true && debts.unconditional === true,
  JSON.stringify(debts))
check('$变体键 overlay 可取', debts.var1 === true && debts.var2 === true, JSON.stringify(debts))

await page2.screenshot({ path: 'shots/glmgirl-final.png' })
console.log('screenshots: shots/glmgirl-idle.png / glmgirl-dialog.png / glmgirl-final.png')
console.log(`\n${pass} passed, ${fail} failed`)
if (errs.length) console.log('页面异常:', errs.slice(0, 4))
await browser.close()
process.exit(fail ? 1 : 0)
