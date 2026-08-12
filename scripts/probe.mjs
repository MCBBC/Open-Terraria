// 世界构成探针：统计各地层的 tile 分布、树数量、液体量
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || '' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));

const stats = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const w = st.w, h = st.h;
  const bands = [
    ['表层(0~0.3h)', 0, Math.floor(h * 0.3)],
    ['浅层(0.3~0.45h)', Math.floor(h * 0.3), Math.floor(h * 0.45)],
    ['中层(0.45~0.7h)', Math.floor(h * 0.45), Math.floor(h * 0.7)],
    ['深层(0.7~1h)', Math.floor(h * 0.7), h],
  ];
  const out = [];
  for (const [name, y0, y1] of bands) {
    const counts = {};
    let liquid = 0, air = 0, total = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = y * w + x;
        total++;
        const t = st.type[i];
        if (t === 0) { if (st.liquid[i] > 0) liquid++; else air++; continue; }
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    const names = { 1: 'dirt', 2: 'stone', 3: 'grass', 4: 'oreCu', 5: 'oreFe', 6: 'oreAg', 7: 'oreAu', 8: 'tree', 10: 'wood' };
    const pct = {};
    for (const k of Object.keys(counts)) pct[names[k] || `t${k}`] = (counts[k] / total * 100).toFixed(1) + '%';
    out.push({ band: name, air: (air / total * 100).toFixed(1) + '%', liquid: liquid * 4, tiles: pct });
  }
  return {
    size: `${w}x${h}`,
    bands: out,
    trees: g.world.trees.length,
    chests: g.world.chests.length,
    spawn: [g.world.spawnX, g.world.spawnY],
    rockLevel: g.world.rockLevel,
  };
});
console.log(JSON.stringify(stats, null, 1));
console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'NO ERRORS');
await browser.close();
