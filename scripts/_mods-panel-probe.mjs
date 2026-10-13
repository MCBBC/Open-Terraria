// 模组面板三批 UX 探针(2026-10-13 用户实报三案):
//   ① 无图标 mod 程序化图标补打(面板行 img.icon dataURL + 注册表回写持久)
//   ② 导入/删除处理态(install/remove 延时包装捕获在途窗口:按钮禁用+「处理中…」/「…」)
//   ③ 游戏内暂停菜单「模组设置」双栏面板(活实例热生效=sw.config 同对象断言+kv 持久化)
// 运行: SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_mods-panel-probe.mjs
import puppeteer from 'puppeteer-core';
import { zipSync, strToU8 } from 'fflate';
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199'

// ---- 测试包构造(零贴图/零内容;cfgtest 带 config 表+暴露 sw.config 活实例) ----
const manifest = (id, name, extra = {}) =>
  strToU8(JSON.stringify({ id, name, version: '1.0.0', author: 'probe', api: 1, ...extra }))
const icontest = zipSync({ 'mod.json': manifest('icontest', 'Icon Test Mod') }, { level: 0 })
const cfgtest = zipSync({
  'mod.json': manifest('cfgtest', 'Config Test Mod', {
    config: {
      showFx: { type: 'bool', default: false, label: 'Show FX' },
      power: { type: 'number', default: 2, min: 1, max: 10, label: 'Power' },
      tag: { type: 'string', default: 'alpha', label: 'Tag' },
    },
  }),
  'scripts/main.js': strToU8('export default function main(sw){ window.__cfgtestLive = sw.config; }'),
}, { level: 0 })
fs.writeFileSync('/tmp/busytest.swmod', zipSync({ 'mod.json': manifest('busytest', 'Busy Test Mod') }, { level: 0 }))
const b64 = (u8) => Buffer.from(u8).toString('base64')

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- ① 标题页装两包(均无 icon.png) ----
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await sleep(6000)
for (const [name, z] of [['icontest', icontest], ['cfgtest', cfgtest]]) {
  const ok = await page.evaluate(async (b) => {
    const bin = atob(b); const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const row = await window.__swMods.install(bytes)
    return row?.iconDataUrl?.startsWith('data:image/png') === true
  }, b64(z)).catch(() => false)
  check(`安装 ${name} 且程序化图标即时落行`, ok)
}

// ---- ② 面板打开 → 行图标渲染(补齐面) ----
await page.evaluate(() => document.querySelector('[data-act=mods]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
await sleep(800)
const icons = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#sw-mods-panel .row')]
  return {
    n: rows.length,
    imgs: rows.map((r) => ({
      name: r.querySelector('.name')?.textContent,
      hasImg: !!r.querySelector('img.icon'),
      isData: (r.querySelector('img.icon')?.src ?? '').startsWith('data:image/png'),
      ph: !!r.querySelector('.icon-ph'),
    })),
  }
}).catch((e) => ({ evalFail: String(e).slice(0, 150) }))
check('面板行全带程序化图标(无占位字母)', icons.n >= 2 && (icons.imgs ?? []).every((r) => r.isData && !r.ph),
  JSON.stringify(icons.imgs))

// ---- ③ 导入处理态(install 延时 700ms 捕获在途窗口;文件选择器喂 /tmp/busytest.swmod) ----
await page.evaluate(async () => {
  const { ModStore } = await import('/src/mods/store.ts')
  const orig = ModStore.prototype.install
  ModStore.prototype.install = async function (...a) {
    await new Promise((r) => setTimeout(r, 700))
    return orig.apply(this, a)
  }
})
const [chooser] = await Promise.all([
  page.waitForFileChooser({ timeout: 10000 }),
  page.evaluate(() => document.querySelector('#sw-mods-panel [data-act=import]')?.click()),
]).catch(() => [null])
let importBusy = null
if (chooser) {
  await chooser.accept(['/tmp/busytest.swmod'])
  await sleep(250)   // 进入 install 延时窗
  importBusy = await page.evaluate(() => {
    const btn = document.querySelector('#sw-mods-panel [data-act=import]')
    return { disabled: btn?.disabled === true, text: btn?.textContent, busy: btn?.getAttribute('aria-busy') }
  })
  await sleep(900)   // 等落库完成
}
check('导入处理态(禁用+处理中+aria-busy)', !!importBusy && importBusy.disabled && importBusy.busy === 'true'
  && String(importBusy.text).includes('处理中'), JSON.stringify(importBusy))
const afterImport = await page.evaluate(() => {
  const names = [...document.querySelectorAll('#sw-mods-panel .name')].map((n) => n.textContent)
  const btn = document.querySelector('#sw-mods-panel [data-act=import]')
  return { names, restored: btn?.textContent, disabled: btn?.disabled }
})
check('导入完成态还原+行出现', (afterImport.names ?? []).includes('Busy Test Mod')
  && afterImport.restored?.includes('.swmod') && afterImport.disabled === false, JSON.stringify(afterImport))

// ---- ④ 删除处理态(remove 延时 600ms 捕获在途窗口) ----
await page.evaluate(async () => {
  const { ModStore } = await import('/src/mods/store.ts')
  const orig = ModStore.prototype.remove
  ModStore.prototype.remove = async function (...a) {
    await new Promise((r) => setTimeout(r, 600))
    return orig.apply(this, a)
  }
})
const delRow = await page.evaluate(() => {
  const row = [...document.querySelectorAll('#sw-mods-panel .row')]
    .find((r) => r.querySelector('.name')?.textContent === 'Busy Test Mod')
  const del = row?.querySelector('button.del')
  del?.click()
  return { had: !!del }
})
await sleep(250)
const delBusy = await page.evaluate(() => {
  const row = [...document.querySelectorAll('#sw-mods-panel .row')]
    .find((r) => r.querySelector('.name')?.textContent === 'Busy Test Mod')
  const del = row?.querySelector('button.del')
  return del ? { disabled: del.disabled, text: del.textContent } : null
})
check('删除处理态(禁用+省略号)', delRow.had && !!delBusy && delBusy.disabled && delBusy.text === '…',
  JSON.stringify(delBusy))
await sleep(900)
const delDone = await page.evaluate(() =>
  [...document.querySelectorAll('#sw-mods-panel .name')].map((n) => n.textContent))
check('删除完成行移除', !(delDone ?? []).includes('Busy Test Mod'), JSON.stringify(delDone))

// 面板收起
await page.evaluate(() => document.querySelector('#sw-mods-panel [data-act=close]')?.click())
await sleep(300)

// ---- ⑤ reload 装载 cfgtest(默认启用) ----
await page.reload({ waitUntil: 'networkidle2' })
await sleep(9000)
const loaded = await page.evaluate(() => {
  const r = window.__swMods?.result?.() ?? null
  return { ids: r?.loaded?.map((m) => m.manifest.id) ?? [], errors: r?.errors ?? [] }
})
check('cfgtest 装载成功', (loaded.ids ?? []).includes('cfgtest') && (loaded.errors ?? []).length === 0,
  JSON.stringify(loaded))

// ---- ⑥ 游戏内:暂停菜单「模组设置」入口 ----
const page2 = await browser.newPage()
page2.on('pageerror', (e) => errs.push('P2 PAGEERR: ' + String(e).slice(0, 200)))
await page2.goto(ORIGIN + '/?play=small', { waitUntil: 'networkidle2', timeout: 90000 })
await page2.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 })
await sleep(2500)
await page2.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'))
  btn?.click()
})
await sleep(1200)
// 真实链:main.ts ui.onPauseMenu = openInGamePause(背包设置钮同款)
const pause = await page2.evaluate(() => {
  window.__swUI.onPauseMenu?.()
  const p = document.querySelector('.sw-pause-panel')
  const modsBtn = [...(p?.querySelectorAll('button') ?? [])].find((b) => b.textContent === '模组设置')
  return { open: !!p, hasModsBtn: !!modsBtn }
}).catch((e) => ({ evalFail: String(e).slice(0, 150) }))
check('暂停菜单打开且「模组设置」入口在场', pause.open === true && pause.hasModsBtn === true, JSON.stringify(pause))

// ---- ⑦ 双栏面板:列表/详情/活实例热生效 ----
await page2.evaluate(() => {
  const btn = [...document.querySelectorAll('.sw-pause-panel button')].find((b) => b.textContent === '模组设置')
  btn?.click()
})
await sleep(800)
const panel = await page2.evaluate(async () => {
  const el = document.getElementById('sw-mod-settings')
  if (!el) return { open: false }
  const rows = [...el.querySelectorAll('.mrow')]
  const cfgRows = [...el.querySelectorAll('.cfgrow')]
  const hint = el.querySelector('[data-hint]')?.textContent ?? ''
  // 热生效断言:编辑 bool+number → 活实例值变+与 sw.config 同对象+kv 落盘
  const boolRow = cfgRows.find((r) => r.querySelector('input[type=checkbox]'))
  boolRow.querySelector('input[type=checkbox]').click()
  const numRow = cfgRows.find((r) => r.querySelector('input[type=number]'))
  const numInput = numRow.querySelector('input[type=number]')
  numInput.value = '9'
  numInput.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 300))
  const { getLiveModConfig } = await import('/src/mods/config.ts')
  const { kvGet } = await import('/src/save/KvStore.ts')
  const live = getLiveModConfig('cfgtest')
  const kv = JSON.parse((await kvGet('sw.mods.config.cfgtest')) ?? '{}')
  return {
    open: true,
    listN: rows.length,
    firstSel: rows[0]?.classList.contains('sel'),
    cfgN: cfgRows.length,
    hint,
    liveVals: live ? { showFx: live.get('showFx'), power: live.get('power') } : null,
    // ★mod 视角热生效真判据:mod entry 持有的 sw.config 包装(闭包 ModConfigState)
    //   立刻读到面板写入值——api.ts sw.config 是 {get,set} 包装,非 state 本体,
    //   同对象断言不成立;读值断言才是用户语义
    modSeesEdit: window.__cfgtestLive
      ? (window.__cfgtestLive.get('showFx') === true && window.__cfgtestLive.get('power') === 9)
      : null,
    kvShowFx: kv.showFx, kvPower: kv.power,
    pauseStill: !!document.querySelector('.sw-pause-panel'),
  }
}).catch((e) => ({ evalFail: String(e).slice(0, 200) }))
check('双栏面板打开(左列表+右配置行)', panel.open && panel.listN >= 1 && panel.cfgN === 3 && panel.firstSel,
  JSON.stringify(panel))
check('活实例热生效(bool/number 即时可见)', panel.liveVals?.showFx === true && panel.liveVals?.power === 9,
  JSON.stringify(panel.liveVals))
check('mod 侧 sw.config 立刻读到新值(实时生效)', panel.modSeesEdit === true, JSON.stringify(panel.modSeesEdit))
check('kv 持久化(重载不丢)', panel.kvShowFx === true && panel.kvPower === 9,
  `showFx=${panel.kvShowFx} power=${panel.kvPower}`)
check('提示行=实时生效语义', String(panel.hint).includes('实时生效'), panel.hint)
check('面板关闭回暂停菜单(菜单仍在场)', panel.pauseStill === true)
await page2.screenshot({ path: 'shots/mods-settings-panel.png' })

// 关面板 → 暂停菜单仍开 → Esc 链收
await page2.evaluate(() => document.querySelector('#sw-mod-settings .sw-modal-close')?.click())
await sleep(300)
const backAtPause = await page2.evaluate(() => ({
  settingsGone: !document.getElementById('sw-mod-settings'),
  pauseStill: !!document.querySelector('.sw-pause-panel'),
}))
check('关闭模组设置回暂停菜单', backAtPause.settingsGone && backAtPause.pauseStill, JSON.stringify(backAtPause))
await page2.screenshot({ path: 'shots/mods-settings-pause.png' })

console.log(`\n${pass} passed, ${fail} failed`)
if (errs.length) console.log('页面异常:', errs.slice(0, 4))
await browser.close()
process.exit(fail ? 1 : 0)
