// 一次性诊断:固定种子世界内 tallgrass/sapling 存量(探针选址排障)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5211';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(origin + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 180000 });
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
  const st = window.__swGame.world.store;
  const T = m.T;
  const counts = { tallgrass: 0, sapling: 0, grass: 0, firstTall: null, firstSap: null };
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const t = st.type[i];
      if (t === T.TALLGRASS) { counts.tallgrass++; if (!counts.firstTall) counts.firstTall = { x, y, flags: st.flags[i] }; }
      else if (t === T.SAPLING) { counts.sapling++; if (!counts.firstSap) counts.firstSap = { x, y, flags: st.flags[i] }; }
      else if (t === T.GRASS) counts.grass++;
    }
  }
  // 表面带植物族 id 统计(前 30 行样本)
  const surfaceIds = {};
  for (let y = st.h > 400 ? 200 : 50; y < 400; y++) {
    for (let x = 1000; x < 3000; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] || st.type[i] === 0) continue;
      const d = m.TILE_DEFS[st.type[i]];
      const k = d?.key ?? ('id' + st.type[i]);
      surfaceIds[k] = (surfaceIds[k] ?? 0) + 1;
    }
  }
  return { counts, surfaceIds: Object.entries(surfaceIds).sort((a, b) => b[1] - a[1]).slice(0, 14) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
