// _lavaslope-repro8: 在用户世界找"宽岩浆面(≥12 连续表面格)且左端邻坡面砖"的岸缘——
// 匹配用户截图形态(大池+长坡岸)。输出 top 候选。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const MAP = '/Users/vinlic/Downloads/map-饥饿的庄园 (1).json';

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
const runs = await p.evaluate(() => {
  const st = window.__swGame.world.store;
  const surf = [];
  for (let y = 2; y < st.h - 2; y++) {
    let x = 2;
    while (x < st.w - 2) {
      const i = st.idx(x, y);
      const isLavaSurf = st.liquidType[i] === 2 && st.liquid[i] > 100 && st.liquid[st.idx(x, y - 1)] === 0;
      if (!isLavaSurf) { x++; continue; }
      let x2 = x;
      while (x2 + 1 < st.w - 2) {
        const j = st.idx(x2 + 1, y);
        if (st.liquidType[j] === 2 && st.liquid[j] > 100 && st.liquid[st.idx(x2 + 1, y - 1)] === 0) x2++;
        else break;
      }
      const width = x2 - x + 1;
      if (width >= 12) {
        // 左端向外找 8 格内的坡面砖
        let shore = null;
        for (let dx = 1; dx <= 8; dx++) {
          const xx = x - dx;
          if (xx < 2) break;
          for (let dy = -2; dy <= 2; dy++) {
            const k = st.idx(xx, y + dy);
            if (st.flags[k] && st.slope[k]) { shore = { x: xx, y: y + dy, slope: st.slope[k] }; break; }
          }
          if (shore) break;
        }
        surf.push({ x0: x, x1: x2, y, width, shore });
      }
      x = x2 + 1;
    }
  }
  return surf.sort((a, b) => b.width - a.width).slice(0, 15);
});
for (const r of runs) console.log(JSON.stringify(r));
await b.close();
process.exit(0);
