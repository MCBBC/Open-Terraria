// _dynbox-debug:菜单流分步截图定位卡点
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5205') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 900000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 150)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.err]', m.text().slice(0, 150)); });
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
const sel = await page.$('select');
console.log('select 存在:', !!sel);
if (sel) {
  await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
  await page.screenshot({ path: '/tmp/dyn-debug-1-menu.png' });
  const btns = await page.$$eval('button', (bs) => bs.map((b) => b.textContent.trim()).slice(0, 8));
  console.log('按钮:', JSON.stringify(btns));
  await page.click('button');
  console.log('已点击,等待世界…');
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await page.evaluate(() => ({
      game: !!window.__swGame, world: !!(window.__swGame && window.__swGame.world),
      flow: !!window.__swFlow,
    })).catch(() => ({ err: 'eval fail' }));
    console.log(`t+${(i + 1) * 5}s:`, JSON.stringify(st));
    if (st.world) break;
    if (i === 2 || i === 6) await page.screenshot({ path: `/tmp/dyn-debug-2-t${i}.png` });
  }
  await page.screenshot({ path: '/tmp/dyn-debug-3-final.png' });
}
await browser.close();
