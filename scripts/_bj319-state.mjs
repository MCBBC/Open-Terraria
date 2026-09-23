import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const page = await browser.newPage();
const cdp0 = await page.createCDPSession();
await cdp0.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const st = await page.evaluate(async () => {
  const g = window.__swGame;
  const t0 = performance.now();
  const tick0 = g.tickCount;
  // 直接测 frame() 单次成本（同步调用一次,排除 rAF 循环）
  const t1 = performance.now();
  try { g.frame(performance.now()); } catch (e) { return { err: String(e) }; }
  const frameMs = performance.now() - t1;
  await new Promise((r) => setTimeout(r, 1500));
  const dt = performance.now() - t0;
  return {
    paused: g.paused, hasFocus: document.hasFocus(),
    tickRate: (g.tickCount - tick0) / (dt / 1000),
    frameMs: +frameMs.toFixed(2),
    rafPerSec: (() => { // 1s 内 rAF 触发次数
      let n = 0; const t0r = performance.now();
      return new Promise((res) => {
        const cb = () => { n++; if (performance.now() - t0r < 1000) requestAnimationFrame(cb); else res(n); };
        requestAnimationFrame(cb);
      });
    })(),
  };
});
console.log(JSON.stringify(st));
await browser.close();
