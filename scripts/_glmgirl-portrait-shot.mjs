// 对话头像(Detailed portrait)实拍:开对话截头像
// ★独立浏览器=全新 KvStore,必须先装包再 reload(探针同款;否则 mod 不在,白拍)
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201'
const b64 = Buffer.from(new Uint8Array(fs.readFileSync('mods/dist/glmgirl.swmod'))).toString('base64')
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
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
await new Promise((r) => setTimeout(r, 800))
const diag = await page.evaluate(() => {
  const g = window.__swGame
  g.debugSpawnNpc(800, 1)
  const n = g.entities.npcs.find((e) => e.vanillaId === 800)
  if (n) { g.player.x = n.x - 80; g.player.y = n.y }
  return {
    found: !!n,
    keys: g.entities.npcs.map((e) => `${e.npcKey}:${e.vanillaId}`),
    loaded: window.__swMods?.result?.()?.loaded?.map((m) => m.manifest.id) ?? null,
  }
})
console.log('diag:', JSON.stringify(diag))
await new Promise((r) => setTimeout(r, 2500))
await page.evaluate(() => {
  const g = window.__swGame
  const n = g.entities.npcs.find((e) => e.vanillaId === 800)
  if (n) g.openNpcDialog(n)
  return { opened: !!n }
})
await new Promise((r) => setTimeout(r, 1200))
const dlg = await page.evaluate(() => ({
  panel: !!document.querySelector('.sw-npc-dialog'),
  img: !!document.querySelector('.sw-npc-dialog img'),
  imgSrc: (document.querySelector('.sw-npc-dialog img') ?? {}).src?.slice(0, 40) ?? null,
}))
console.log('dialog:', JSON.stringify(dlg))
await page.screenshot({ path: 'shots/glmgirl-portrait.png' })
console.log('shot: shots/glmgirl-portrait.png')
await browser.close()
