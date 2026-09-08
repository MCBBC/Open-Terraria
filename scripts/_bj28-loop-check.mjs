import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 240000, defaultViewport: { width: 1200, height: 800 },
});
const page = await browser.newPage();
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5215') + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 1000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'loopchk');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
});
await page.evaluate(() => window.__swFlow.newWorld('loopchk', 300, 180));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const t0 = g.tickCount;
  const raf0 = await new Promise((res) => requestAnimationFrame(() => res(performance.now())));
  await new Promise((r) => setTimeout(r, 600));
  const raf1 = await new Promise((res) => requestAnimationFrame((t) => res(t)));
  return {
    tickDelta: g.tickCount - t0,
    rafAlive: raf1 > raf0,
    hidden: document.hidden,
    visibility: document.visibilityState,
    loopPaused: g.paused ?? null,
    uiBlocking: g.input?.uiBlocking ?? null,
    keysProbe: (() => { g.input.keys.add('Space'); return g.input.downAction('Jump'); })(),
  };
});
console.log(JSON.stringify(out));
await browser.close();
