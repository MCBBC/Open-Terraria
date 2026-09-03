// __swMapDebug 自检 API 验证:已转换世界 → 数据层应判"完整"(重绘前后哈希相等)
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await b.newPage();
page.on('console', m => { if (m.text().startsWith('[mm]') || m.text().startsWith('[worldjobs]')) console.log('LOG', m.text().slice(0, 120)); });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const sleep = ms => new Promise(r => setTimeout(r, ms));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 }).catch(() => {});
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(() => {}); await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {}); }
await sleep(400);
if (!(await page.$('.sw-vsel-list .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 }); await sleep(400);
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('调试' + Math.floor(Math.random() * 90 + 10));
  await sleep(200);
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel-list .sw-vitem', { timeout: 15000 }); await sleep(600);
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 12000 }).catch(() => {});
await sleep(500);
for (let i = 0; i < 30 && !(await page.$('.sw-vsel-list .sw-vitem')); i++) await sleep(500);
const idx = await page.evaluate(() => Math.max(0, [...document.querySelectorAll('.sw-vsel-list .sw-vitem')].findIndex(e => /撕裂|RainLab/.test(e.textContent))));
await page.evaluate((i) => document.querySelectorAll('.sw-vsel-list .sw-vitem')[i]?.click(), idx);
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 600000, polling: 500 });
await sleep(2500);
const dbg = await page.evaluate(async () => {
  const g = window.__swGame;
  const fn = window.__swMapDebug;
  if (!fn) return { error: 'no __swMapDebug' };
  return fn();
});
console.log('MAPDEBUG:', JSON.stringify(dbg, null, 1));
await b.close();
