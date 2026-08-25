// D 链调试：支撑挖除 → sandQueue → FallingBlock → 落格,逐环采样
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 1000));
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SAND = tiles.TILE_BY_KEY['sand'];
  const DIRT = tiles.TILE_BY_KEY['dirt'];
  const GRASS = tiles.TILE_BY_KEY['grass'];

  const X = g.world.spawnX + 12;
  const Y = Math.floor(g.world.groundLevel);
  for (let dx = -2; dx <= 2; dx++) for (let dy = -9; dy <= -1; dy++) {
    if (st.get(X + dx, Y + dy) !== 0) st.setTile(X + dx, Y + dy, 0, 0, 0);
  }
  for (let dx = -2; dx <= 2; dx++) st.setTile(X + dx, Y, GRASS, 0, 0);

  st.setTile(X, Y - 5, SAND, 0, 0);
  const samples = [{ step: 'sand@Y-5', queue: g.sandQueue?.length ?? 'n/a', tile: st.get(X, Y - 5) }];
  st.setTile(X, Y - 6, DIRT, 0, 0);
  samples.push({ step: 'support@Y-6', queue: g.sandQueue?.length ?? 'n/a', tile: st.get(X, Y - 5) });
  st.setTile(X, Y - 6, 0, 0, 0);
  samples.push({ step: 'dig support', queue: g.sandQueue?.length ?? 'n/a', tile: st.get(X, Y - 5) });
  for (let i = 0; i < 8; i++) {
    await sleep(150);
    const fb = (g.entities?.projectiles ?? []).find?.((e) => e?.tileKey === 'sand' && !e.dead);
    samples.push({
      step: `+${(i + 1) * 150}ms`,
      queue: g.sandQueue?.length ?? 'n/a',
      tile: st.get(X, Y - 5),
      above: st.get(X, Y - 1),
      fbAlive: !!fb,
      fbCy: fb ? +((fb.y + 5) / 16).toFixed(1) : null,
    });
    if (st.get(X, Y - 1) === SAND) break;
  }
  return { X, Y, sandId: SAND, samples };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
