// 萤火虫/蝴蝶 tick 成本分段基准（怪力按压排查辅助）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000 });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5199'}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const T = 16;
  const st = g.world.store;
  const ptx = Math.floor(g.player.cx / T);
  let gy = 4;
  while (gy < st.h - 10 && !st.isSolid(ptx, gy)) gy++;
  for (let dx = -30; dx <= 30; dx++) for (let dy = -8; dy <= 0; dy++) st.setTile(ptx + dx, gy + dy, 0);
  g.player.x = ptx * T; g.player.y = (gy - 4) * T; g.player.vx = 0; g.player.vy = 0;
  g.world.clock.isDay = true;
  const bench = (label, n) => {
    const s = performance.now();
    for (let i = 0; i < n; i++) {
      if (i % 30 === 0) { g.player.x = ptx * T; g.player.y = (gy - 4) * T; g.player.vx = 0; g.player.vy = 0; }
      g.fixedUpdate(1 / 60);
    }
    return { label, ms: Math.round(performance.now() - s), per: +((performance.now() - s) / n).toFixed(1) };
  };
  const r = [];
  r.push(bench('baseline', 50));
  for (let i = 0; i < 4; i++) g.debugSpawnNpc(356, (ptx - 8 + i * 5) * T, (gy - 6) * T, false);
  r.push(bench('+4 butterflies', 50));
  for (let i = 0; i < 4; i++) g.debugSpawnNpc(355, (ptx - 8 + i * 5) * T, (gy - 6) * T, false);
  r.push(bench('+4 fireflies', 50));
  return r;
}).catch((e) => ({ err: String(e) }));
console.log(JSON.stringify(out));
if (errs.length) console.log('页面异常:', errs.slice(0, 2));
await browser.close();
