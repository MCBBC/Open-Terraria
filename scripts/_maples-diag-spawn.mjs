import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('http://localhost:5211/?play=small', { waitUntil: 'domcontentloaded', timeout: 180000 });
let inGame = false;
for (let i = 0; i < 300 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.world)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1000));
}
await page.evaluate(async () => { await window.__swGame.newWorld('05162020', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 300 && !ready; i++) {
  ready = await page.evaluate(() => window.__swGame?.world?.store?.w === 4200).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 1000));
}
const out = await page.evaluate(async () => {
  const m = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const T = m.T;
  const sx = g.world.spawnX;
  const rows = [];
  const isAir = (x, y) => { const i = st.idx(x, y); return st.type[i] === 0 || !st.flags[i]; };
  for (let dx = -40; dx <= 40; dx += 1) {
    const x = sx + dx;
    // 找该列地表首实心
    let gy = -1;
    for (let y = Math.max(4, Math.floor(g.world.groundLevel) - 100); y < Math.floor(g.world.groundLevel) + 100; y++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] !== 0) { gy = y; break; }
    }
    if (gy < 0) { rows.push({ dx, gy: -1 }); continue; }
    const d = m.TILE_DEFS[st.type[st.idx(x, gy)]];
    rows.push({ dx, gy, key: d?.key ?? '?', sheet: d?.vanilla?.sheet ?? -1, airAbove: isAir(x, gy - 1) });
  }
  const summary = {};
  for (const r of rows) summary[r.key] = (summary[r.key] ?? 0) + 1;
  const grassRows = rows.filter((r) => r.key === 'grass' && r.airAbove);
  return { spawnX: sx, groundLevel: g.world.groundLevel, summary, firstGrassAirAbove: grassRows.slice(0, 6), playerTileY: Math.floor(g.player.cy / 16) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
