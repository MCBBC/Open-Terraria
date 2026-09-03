import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const MAP = '/Users/vinlic/Downloads/map-饥饿的庄园 (1).json';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 800, height: 600 },
});
const p = await b.newPage();
let booted = false;
for (let attempt = 0; attempt < 3 && !booted; attempt++) {
  await p.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson).catch(() => false)) { booted = true; break; }
  }
}
await p.evaluate(async t => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame?.world?.store?.w).catch(() => false)) break;
}
const probe1 = await p.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  let cnt = 0, lavaCnt = 0, slopeLiq = 0;
  for (let x = 3648; x < 3680; x++)
    for (let y = 1120; y < 1152; y++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0) { cnt++; if (st.liquidType[i] === 2) lavaCnt++; }
      if (st.flags[i] && (st.slope[i] || st.half[i]) && Math.max(
        st.liquid[st.idx(x - 1, y)], st.liquid[st.idx(x + 1, y)],
        st.liquid[st.idx(x, y - 1)], st.liquid[st.idx(x, y + 1)]) > 0) slopeLiq++;
    }
  return { cnt, lavaCnt, slopeLiq, w: st.w, h: st.h, name: g.world.name };
});
console.log('载入后立即探测 (3648-3680,1120-1152):', JSON.stringify(probe1));
await b.close();
