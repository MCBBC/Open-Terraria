// 弹幕可见性诊断:直造一发 mod 弹,冻结采样其屏幕区域像素
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201'
const b64 = (p) => Buffer.from(new Uint8Array(fs.readFileSync(p))).toString('base64')
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 160)))
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 5000))
await page.evaluate(async (b64r) => {
  const bin = atob(b64r)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return await window.__swMods.install(bytes)
}, b64('mods/dist/rivals.swmod'))
await page.reload({ waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 9000))
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 })
await new Promise((r) => setTimeout(r, 2000))
const out = await page.evaluate(async () => {
  const g = window.__swGame
  const { ModProj } = await import('/src/entities/ModProj.ts')
  const px = g.player.x + 100, py = g.player.y - 40
  const p = new ModProj(px, py, 0.3, -0.5, 10, 2, 2002, true)   // claude_star (2002)
  g.entities.add(p, 'projectiles')
  await new Promise((r) => setTimeout(r, 120))
  const [sx, sy] = g.camera.worldToScreen(p.x, p.y)
  const d = g.renderer.ctx.getImageData(Math.round(sx) - 12, Math.round(sy) - 12, 28, 28).data
  let npx = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 30) npx++
  const atlas = g.renderer.atlas
  const img = atlas?.ensureVImage?.(`vanilla/Projectile_2002.png`) ?? null
  return { cover: +(npx / (28 * 28)).toFixed(2), texInAtlas: !!img, w: img?.width ?? 0 }
}).catch((e) => ({ evalFail: String(e).slice(0, 200) }))
console.log('PROJVIS:', JSON.stringify(out))
await page.screenshot({ path: 'shots/rivals-projvis.png' })
await browser.close()
