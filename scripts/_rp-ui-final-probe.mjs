// UI 终验:关闭钮在卡体右上+hover、详情取消=回列表不关框、启用进行态
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
page.on('dialog', (d) => { d.accept().catch(() => {}) })
let pass = 0, fail = 0
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${e ? '  ' + e : ''}`); ok ? pass++ : fail++ }
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 })
await new Promise((r) => setTimeout(r, 6000))
await page.evaluate(async (b64) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  await window.__swResourcePacks.importPack(bytes, 'waifu-pack.zip')
}, zipB64)
await page.evaluate(() => document.querySelector('[data-act=packs]')?.click())
await new Promise((r) => setTimeout(r, 800))
// 启用行第一个按钮(禁用态=点它启用)→ 进行态核验:点击后按钮应禁用+文案变
const busy = await page.evaluate(async () => {
  const row = document.querySelector('.sw-rp-row')
  const btn = row?.querySelector('.sw-rp-btns button')
  if (!btn) return { fail: 'no row' }
  const before = btn.textContent
  b = btn; b.click()
  await new Promise((r) => setTimeout(r, 60))   // 同步窗口内抓进行态
  const during = { disabled: btn.disabled, text: btn.textContent }
  await new Promise((r) => setTimeout(r, 6000))   // 重放含全图解码,秒级
  return { before, during, after: btn.textContent, enabledRow: !!document.querySelector('.sw-rp-btns button.on') }
})
check('启用进行态(禁用+处理中文案)', busy.during?.disabled === true && (busy.during?.text ?? '').includes('处理中'), JSON.stringify(busy.during))
check('启用完成(行进已启用列)', busy.enabledRow === true, JSON.stringify(busy.after))
// 关闭钮位置:应在卡体(.sw-rp-wrap)内右上
const closePos = await page.evaluate(() => {
  const close = document.querySelector('.sw-rp-modal-close')
  if (!close) return { fail: 'missing' }
  const card = close.parentElement.getBoundingClientRect(), xr = close.getBoundingClientRect()
  return { inside: xr.top >= card.top - 2 && xr.right <= card.right + 2, hoverRule: true }
})
check('关闭钮在卡体右上', closePos.inside === true, JSON.stringify(closePos))
const hover = await page.evaluate(() => {
  const st = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules] } catch { return [] } })
  return st.some((r) => r.selectorText?.includes('.sw-rp-modal-close:hover'))
})
check('关闭钮有 hover 效果', hover === true)
// 详情页取消 = 回列表不关框
await page.evaluate(() => { const b = [...document.querySelectorAll('.sw-rp-btns button')].find((x) => x.textContent === 'ⓘ'); b?.click() })
await new Promise((r) => setTimeout(r, 400))
const infoOpen = await page.evaluate(() => ({ info: !!document.querySelector('.sw-rp-info-head'), closeAlive: !!document.querySelector('.sw-rp-modal-close') }))
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === '取消'); b?.click() })
await new Promise((r) => setTimeout(r, 400))
const back = await page.evaluate(() => ({ infoClosed: !document.querySelector('.sw-rp-info-head'), closeAlive: !!document.querySelector('.sw-rp-modal-close') }))
check('详情取消=回列表(框保留)', infoOpen.info === true && back.infoClosed === true && back.closeAlive === true, JSON.stringify({ infoOpen, back }))
console.log(`\n${pass} passed, ${fail} failed`)
await page.screenshot({ path: 'shots/rp-ui-final.png' })
await browser.close()
process.exit(fail ? 1 : 0)
