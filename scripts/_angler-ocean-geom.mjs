// 海洋几何：水面 y vs groundLevel——判定水支 angler 条件可否成立
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2500));
const out = await p.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const res = { groundLevel: g.world.groundLevel, w: st.w, h: st.h };
  // 两侧海洋：找最靠边缘的水面顶 y 与最深水底
  for (const [label, x0] of [['left', 8], ['right', st.w - 9]]) {
    let topY = -1, botY = -1;
    for (let x = x0; x < x0 + 300; x++) {
      for (let y = 4; y < g.world.groundLevel + 80; y++) {
        if (st.liquid[st.idx(x, y)] > 0) { if (topY < 0 || y < topY) topY = y; break; }
      }
    }
    // 最深点
    for (let x = x0; x < x0 + 300; x++) {
      for (let y = 4; y < g.world.groundLevel + 80; y++) {
        if (st.liquid[st.idx(x, y)] > 0) { if (y > botY) botY = y; }
      }
    }
    res[label] = { topY, botY, depth: botY - topY };
  }
  res.anglerDoor = `水支需 spawnTileY(海床) < groundLevel-10 = ${g.world.groundLevel - 10}`;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
