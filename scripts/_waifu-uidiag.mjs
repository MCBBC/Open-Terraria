// 注入落点诊断:uiimages/uiFiles/vui 三面查 Player_0_0
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
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 6000))
await page.evaluate(async (b64) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const mgr = window.__swResourcePacks
  const row = await mgr.importPack(bytes, 'waifu-pack.zip')
  await mgr.setEnabled(row.id, true)
  return row.id
}, zipB64)
await new Promise((r) => setTimeout(r, 3000))
const diag = await page.evaluate(() => {
  const a = window.__swAtlas ?? window.__swGame?.renderer?.atlas ?? null
  if (!a) return { fail: 'no atlas' }
  const out = { hasKey: a.uiFileExists('Player_0_0.png'), path: a.uiFiles?.['Player_0_0.png'] ?? null }
  // 三种可能落位全查
  for (const k of ['vanilla-ui/Player_0_0.png', 'Player_0_0.png']) {
    out['vimages:' + k] = !!a.vimages?.get(k)
    out['uiimages:' + k] = !!a.uiimages?.get(k)
    out['uiimages(path):' + k] = !!a.uiimages?.get(a.uiFiles?.['Player_0_0.png'])
  }
  const r = a.vui('Player_0_0.png')
  out.vuiRect = r ? `${r.sw}x${r.sh}` : null
  // 运行时注入映射是哪张 map:查 remaster runtime 的注入目标(通过任一已知包键)
  for (const k of ['vanilla-ui/Player_Hair_5.png']) out['uiimages:' + k] = !!a.uiimages?.get(k)
  return out
})
console.log(JSON.stringify(diag, null, 1))
await browser.close()
