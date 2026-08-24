// 用户位置当前渲染确认:三点(上2/原位/下2)截图
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
// 用户报障位置(tile 511,255 夜晚):原位/上2/下2 各截一张
for (const pair of [['up', 253], ['mid', 255], ['down', 257]]) {
  await page.evaluate((ty) => {
    const g = window.__swGame, pl = g.player;
    pl.x = 511 * 16 + 8 - pl.w / 2; pl.y = ty * 16 - pl.h / 2; pl.vx = 0; pl.vy = 0;
  }, pair[1]);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: '/tmp/uc-' + pair[0] + '.png' });
}
await browser.close();
