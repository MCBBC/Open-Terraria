// _lavaslope-repro13: 全图坡面×液体 候选聚类 → 输出簇中心(密度 top)。
// 后续按簇跑 oracle。本次只输出簇清单。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const MAP = needInput(join(DOWNLOADS, 'map-饥饿的庄园 (1).json'));

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
if (!booted) { console.log('FAIL boot'); await b.close(); process.exit(1); }
await p.evaluate(async t => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame?.world?.store?.w).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 1500));
const clusters = await p.evaluate(() => {
  const st = window.__swGame.world.store;
  // 粗网格计数(32×32 tile 桶):桶内「坡面砖×邻岩浆」数
  const BW = 32, BH = 32;
  const grid = new Map();
  for (let x = 2; x < st.w - 2; x++) {
    for (let y = 2; y < st.h - 2; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const sl = st.slope[i], hf = st.half[i];
      if (!sl && !hf) continue;
      const L = st.liquid[st.idx(x - 1, y)], R = st.liquid[st.idx(x + 1, y)];
      const U = st.liquid[st.idx(x, y - 1)], D = st.liquid[st.idx(x, y + 1)];
      if (Math.max(L, R, U, D) <= 0) continue;
      const lt = st.liquidType[L > 0 ? st.idx(x - 1, y) : R > 0 ? st.idx(x + 1, y) : U > 0 ? st.idx(x, y - 1) : st.idx(x, y + 1)];
      const key = `${Math.floor(x / BW)},${Math.floor(y / BH)},${lt}`;
      grid.set(key, (grid.get(key) || 0) + 1);
    }
  }
  return [...grid.entries()].map(([k, n]) => {
    const [bx, by, lt] = k.split(',');
    return { bx: +bx, by: +by, lt: +lt, n, cx: (+bx) * BW + BW / 2, cy: (+by) * BH + BH / 2 };
  }).filter(c => c.n >= 8).sort((a, b) => b.n - a.n).slice(0, 30);
});
for (const c of clusters) console.log(JSON.stringify(c));
await b.close();
process.exit(0);
