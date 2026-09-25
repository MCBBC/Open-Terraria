// BJ344：onDripSplash 赋值陷阱——记录每次赋值的调用栈（判 destroy 后重赋值者）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  let real = undefined;
  const log = [];
  window.__bj344Trap = log;
  const tryTrap = () => {
    const np = window.__swNatureParticles;
    if (!np || Object.getOwnPropertyDescriptor(np, 'onDripSplash')?.set) { setTimeout(tryTrap, 500); return; }
    let cur = np.onDripSplash;
    Object.defineProperty(np, 'onDripSplash', {
      configurable: true, enumerable: true,
      get() { return cur; },
      set(v) {
        cur = v;
        log.push({ v: v ? 'fn' : 'null', stack: (v ? new Error().stack : '').split('\n').slice(1, 4).join(' | ').slice(0, 400) });
      },
    });
  };
  setTimeout(tryTrap, 300);
});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { const s = document.querySelector('select'); if (s) { s.selectedIndex = 0; s.parentElement.querySelector('button').click(); } });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(async () => { await window.__swFlow.quitToMenu(); });
await new Promise((r) => setTimeout(r, 2500));
const log = await page.evaluate(() => window.__bj344Trap);
console.log('assignments:', log.length);
for (const [i, a] of log.entries()) console.log(`#${i} v=${a.v} ${a.stack || '(null)'}`);
await browser.close();
