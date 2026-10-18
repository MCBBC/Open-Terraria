// _lavaslope-repro10: 在用户世界玩家最后位置 (1646,860) 附近 ±250 扫岩浆岸缘(坡面砖×邻液)。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const MAP = needInput(join(DOWNLOADS, 'map-饥饿的庄园 (1).json'));
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 },
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
const out = await p.evaluate(() => {
  const st = window.__swGame.world.store;
  const PX = 1646, PY = 860, R = 260;
  const hits = [];
  for (let x = PX - R; x < PX + R; x++) {
    for (let y = PY - R; y < PY + R; y++) {
      if (x < 2 || y < 2 || x >= st.w - 2 || y >= st.h - 2) continue;
      const i = st.idx(x, y);
      const sl = st.slope[i], hf = st.half[i];
      if (!sl && !hf) continue;
      if (!st.flags[i]) continue;
      const L = st.liquid[st.idx(x - 1, y)], Rq = st.liquid[st.idx(x + 1, y)];
      const U = st.liquid[st.idx(x, y - 1)], D = st.liquid[st.idx(x, y + 1)];
      const lts = [st.liquidType[st.idx(x - 1, y)], st.liquidType[st.idx(x + 1, y)],
        st.liquidType[st.idx(x, y - 1)], st.liquidType[st.idx(x, y + 1)]];
      const amt = Math.max(L, Rq, U, D);
      if (amt <= 0) continue;
      const lt = lts.find((t, k) => [L, Rq, U, D][k] > 0);
      hits.push({ x, y, sl, hf, t: st.type[i], L, R: Rq, U, D, lt, wall: st.wall[i] });
    }
  }
  return hits;
});
console.log('候选数:', out.length);
for (const h of out.slice(0, 40)) console.log(JSON.stringify(h));
await b.close();
process.exit(0);
