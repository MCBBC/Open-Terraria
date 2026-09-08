// IIII220 侧探针3:药草普查修正版(以 TILE_DEFS.vanilla.sheet 映射 82/83/84)
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
  const herbs = {};
  const hellHerbSubstrate = {};
  for (let y = 10; y < st.h - 10; y++) {
    for (let x = 10; x < st.w - 10; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const s = sheetOf(st.type[i]);
      if (s === 82 || s === 83 || s === 84) {
        const k = `s${s}_fx${st.frameX[i]}`;
        herbs[k] = (herbs[k] ?? 0) + 1;
        if (y > st.h - 250) {
          const bi = st.idx(x, y + 1);
          const bs = st.flags[bi] ? sheetOf(st.type[bi]) : 'air';
          hellHerbSubstrate['s' + s + '_on_s' + bs] = (hellHerbSubstrate['s' + s + '_on_s' + bs] ?? 0) + 1;
        }
      }
    }
  }
  return { herbs, hellHerbSubstrate };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
