// r15 蓝队渲染冒烟:进图跑 600 帧,抓 render() 异常 + 层序关键态采样
import puppeteer from 'puppeteer-core';

const origin = process.env.SW_ORIGIN ?? 'http://localhost:5205';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const state = await page.evaluate(() => {
  const g = window.__swGame;
  return { hasWorld: !!g?.world, w: g?.world?.w, h: g?.world?.h };
});
console.log('state', JSON.stringify(state));
// 跑 400 帧
const r = await page.evaluate(async () => {
  const g = window.__swGame;
  let frames = 0, errs = 0;
  for (let i = 0; i < 400; i++) {
    try { g.tick ? g.tick() : g.update?.(); frames++; } catch (e) { errs++; if (errs < 3) console.error('tick err', e.message); }
    await new Promise((res) => requestAnimationFrame(res));
  }
  return { frames, errs };
});
console.log('frames', JSON.stringify(r));
console.log('errors', errors.length, errors.slice(0, 5));
await browser.close();
