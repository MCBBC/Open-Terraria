// IIII220 侧探针2:hell 层定位(以 TILE_DEFS.vanilla.sheet 映射;全高 ash/岩浆/地狱砖普查)
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5277';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 200000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const sheetOf = (t) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  // 全高(步进4)按 sheet 普查 ash=57 / hellstone=58 / lava count
  const ashByBand = {}, hellstoneByBand = {};
  let lavaCount = 0;
  for (let y = 0; y < st.h; y += 3) {
    for (let x = 0; x < st.w; x += 3) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const s = sheetOf(st.type[i]);
      if (s === 57) ashByBand[y] = (ashByBand[y] ?? 0) + 1;
      if (s === 58) hellstoneByBand[y] = (hellstoneByBand[y] ?? 0) + 1;
    }
  }
  for (let y = st.h - 400; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0 && st.liquidType[i] === 2) lavaCount++;
    }
  }
  const top = (m) => Object.entries(m).map(([y, n]) => ({ y: +y, n })).sort((a, b) => b.n - a.n).slice(0, 6);
  // 底部 120 行类型直方图(前 12)
  const hist = {};
  for (let y = st.h - 120; y < st.h - 5; y++) {
    for (let x = 0; x < st.w; x += 2) {
      const i = st.idx(x, y);
      if (!st.flags[i]) { hist['AIR'] = (hist['AIR'] ?? 0) + 1; continue; }
      const s = sheetOf(st.type[i]);
      hist['s' + s] = (hist['s' + s] ?? 0) + 1;
    }
  }
  return { ashTop: top(ashByBand), hellstoneTop: top(hellstoneByBand), lavaCount, bottomHist: Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 12) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
