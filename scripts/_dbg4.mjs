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
const count = () => p.evaluate(() => {
  const st = window.__swGame.world.store;
  let lava = 0, slopeLiq = 0;
  for (let x = 3648; x < 3680; x++)
    for (let y = 1120; y < 1152; y++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0 && st.liquidType[i] === 2) lava++;
      if (st.flags[i] && (st.slope[i] || st.half[i]) && Math.max(
        st.liquid[st.idx(x - 1, y)], st.liquid[st.idx(x + 1, y)],
        st.liquid[st.idx(x, y - 1)], st.liquid[st.idx(x, y + 1)]) > 0) slopeLiq++;
    }
  return { lava, slopeLiq };
});
console.log('T0 载入后:', JSON.stringify(await count()));
await p.evaluate(() => {
  const g = window.__swGame;
  g.liquid.updateLiquid = () => {};
  g.player.debugGod = true; g.player.hp = g.player.maxHp; g.player.dead = false;
});
console.log('T1 冻结后:', JSON.stringify(await count()));
await p.evaluate(() => { const g = window.__swGame; try { g.setZoom(0.5); } catch (e) {} });
console.log('T2 缩放后:', JSON.stringify(await count()));
await p.evaluate(() => {
  const g = window.__swGame, pl = g.player;
  pl.x = 3664 * 16 - pl.w / 2; pl.y = (1136 - 12) * 16;
  pl.vx = 0; pl.vy = 0;
});
console.log('T3 传送后:', JSON.stringify(await count()));
await new Promise(r => setTimeout(r, 2500));
console.log('T4 2.5s后:', JSON.stringify(await count()));
await b.close();
