// 烘焙账本全景诊断：cap.bakes 全图 + 挂钟推进速率 + 动画注册表可见性
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || '/Users/vinlic/Downloads/map-FTW_V2 (10).json';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });
const placementVerdict = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const tmap = (await import('/src/data/tiles.ts')).TILE_INTERNAL_BY_SHEET;
  const cap = window.__swTileCap;
  const id220 = tmap.get(220);
  // 出生点附近找平地放固化机
  const sx = Math.floor(st.w / 2), sy0 = Math.floor(st.h / 2);
  let ox = -1, oy = -1;
  outer:
  for (let y = sy0; y < st.h - 8; y++) for (let x = sx - 40; x < sx + 40; x++) {
    let okFlat = true;
    for (let dx = 0; dx < 5 && okFlat; dx++)
      if (!st.flags[st.idx(x + dx, y)] || st.flags[st.idx(x + dx, y - 1)] || st.flags[st.idx(x + dx, y - 2)]) okFlat = false;
    if (okFlat) { ox = x; oy = y; break outer; }
  }
  if (ox < 0) return { fail: 'no ground' };
  const top = oy - 3;
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) st.setTile(ox + dx, top + dy, id220);
  const d0 = cap.bakes.get(220)?.n ?? 0;
  // 玩家贴近
  g.player.x = (ox + 1) * 16; g.player.y = (top + 4) * 16;
  await new Promise((r) => setTimeout(r, 2500));
  const d1 = cap.bakes.get(220)?.n ?? 0;
  // 强制出屏再回（~400 格外）促发 LRU/视界重建
  g.player.x += 4096; await new Promise((r) => setTimeout(r, 1500));
  g.player.x -= 4096; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 3000));
  const d2 = cap.bakes.get(220)?.n ?? 0;
  return { ox, top, bakeNearby: d1 - d0, bakeAfterReturn: d2 - d1,
           draws220: cap.sheets.get(220)?.n ?? -1,
           fb220: cap.sheets.get(220)?.fallback ?? -1 };
});
console.log('PLACEMENT:', JSON.stringify(placementVerdict));
const out = await page.evaluate(async () => {
  const cap = window.__swTileCap;
  const TA = await import('/src/render/TileAnim.ts');
  const t0 = TA.tileAnim.tick;
  await new Promise((r) => setTimeout(r, 3000));
  const t1 = TA.tileAnim.tick;
  const bakes = {};
  cap.bakes.forEach((v, k) => { if (v.n > 0) bakes[k] = v; });
  return {
    tickDelta: t1 - t0,
    t0, t1,
    bakesTop: Object.entries(bakes).sort((a, b) => b[1].n - a[1].n).slice(0, 25),
    bakesKeysAll: Object.keys(bakes),
    rateKeys: Object.keys(cap.tblRate).map(Number).sort((a, b) => a - b),
  };
});
console.log(JSON.stringify(out, null, 1));
process.exit(0);
