// worker 路径冒烟：直调 WorldGenClient 生成小世界（握手 → generate → fromPacket 重建）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForSelector('select', { timeout: 60000 }).catch(() => console.log('select timeout'));
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
const ok = await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 240000 }).then(() => true).catch(() => false);
console.log('game ready:', ok);
if (ok) {
  const r = await page.evaluate(async () => {
    const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
    const client = new WorldGenClient();
    const probe = await client.probe();
    if (!probe) return { probe: false };
    const t0 = performance.now();
    const w = await client.generate({ width: 4200, height: 1200, seedText: 'workertest' }, {});
    let liquidCells = 0;
    for (let i = 0; i < w.store.liquid.length; i++) if (w.store.liquid[i]) liquidCells++;
    return {
      probe: true,
      ms: Math.round(performance.now() - t0),
      w: w.w, h: w.h, spawn: [w.spawnX, w.spawnY], ground: w.groundLevel,
      liquidCells, name: w.name,
    };
  });
  console.log(JSON.stringify(r, null, 1));
}
await browser.close();
