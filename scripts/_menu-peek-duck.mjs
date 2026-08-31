import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
page.on('console', m => console.log('CON', m.type(), m.text().slice(0, 100)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
for (let i = 0; i < 40; i++) {
  if (await page.evaluate(() => !!document.querySelector('[data-act=sp]'))) break;
  await new Promise(r => setTimeout(r, 500));
}
await new Promise(r => setTimeout(r, 2500));
// 方案A:真鼠标坐标点击
const box = await page.evaluate(() => {
  const el = document.querySelector('[data-act=sp]');
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
console.log('sp box center', JSON.stringify(box));
await page.mouse.click(box.x, box.y);
await new Promise(r => setTimeout(r, 1500));
let dom = await page.evaluate(() => [...document.querySelectorAll('[class*=sw-]')].map(e => e.className.toString()).filter(c => c.includes('panel') || c.includes('list') || c.includes('char')).slice(0, 30));
console.log('afterA:', JSON.stringify(dom));
if (!dom.length) {
  // 方案B:直接 el.click()
  await page.evaluate(() => document.querySelector('[data-act=sp]')?.click());
  await new Promise(r => setTimeout(r, 1500));
  dom = await page.evaluate(() => [...document.querySelectorAll('[class*=sw-]')].map(e => e.className.toString()).slice(0, 40));
  console.log('afterB:', JSON.stringify(dom));
}
await page.screenshot({ path: '/tmp/sw-menu-after-sp.png' });
await browser.close();
