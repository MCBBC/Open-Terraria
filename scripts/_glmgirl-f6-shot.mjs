// F6 召唤面板实拍:确认 GLM娘 出现在面板(空查询视图 + GLM 搜索)
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 })
await new Promise((r) => setTimeout(r, 2500))
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'))
  btn?.click()
})
await new Promise((r) => setTimeout(r, 800))
// 开 F6 面板(惰性创建走 toggleSummonPanel)+ 搜 GLM
const shot = await page.evaluate(() => {
  const g = window.__swGame
  g.toggleSummonPanel()
  const input = document.querySelector('.sw-summon-panel input')
  if (input) {
    input.value = 'GLM'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return { open: !!g.summonPanel?.open, hasInput: !!input }
})
await new Promise((r) => setTimeout(r, 800))
console.log('F6:', JSON.stringify(shot))
await page.screenshot({ path: 'shots/glmgirl-f6.png' })
console.log('shot: shots/glmgirl-f6.png')
await browser.close()
