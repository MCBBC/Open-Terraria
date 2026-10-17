// 一次性诊断:强植 tile 的 store 帧跨时点读出(放置后立即/1s/3s)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5211/?play=small', { waitUntil: 'domcontentloaded', timeout: 180000 });
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
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => { window.__swGame.paused = true; });
await new Promise((r) => setTimeout(r, 800));
const feats = await page.evaluate(async () => {
  const m = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const T = m.T;
  const isAir = (x, y) => { const i = st.idx(x, y); return st.type[i] === 0 || !st.flags[i]; };
  const gl = Math.floor(g.world.groundLevel);
  let grass = null;
  const x0 = g.world.spawnX - 38, x1 = g.world.spawnX + 38;
  for (let y = Math.max(4, gl - 110); y < Math.min(st.h - 4, gl + 110) && !grass; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] || st.type[i] !== T.GRASS) continue;
      if (isAir(x, y - 1)) { grass = { x, y }; break; }
    }
  }
  const spots = [];
  for (let dx = 2; dx < 20 && spots.length < 2; dx++) {
    const x = grass.x + dx;
    for (let y = grass.y - 6; y <= grass.y + 6; y++) {
      const i = st.idx(x, y);
      const t = st.type[i];
      if (t === 0 || !st.flags[i]) continue;
      if ((t === T.GRASS || t === T.DIRT) && isAir(x, y - 1)) spots.push({ x, y: y - 1 });
      break;
    }
  }
  // 逐监听器定位:每次只开一个监听器放置,看谁杀
  const orig = st.listeners.slice();
  let killer = null;
  for (let li = 0; li < orig.length; li++) {
    st.listeners.length = 0;
    st.listeners.push(orig[li]);
    st.setTile(spots[0].x, spots[0].y, T.TALLGRASS, 0, 0);
    const ok = st.type[st.idx(spots[0].x, spots[0].y)] === T.TALLGRASS;
    if (!ok) { killer = li; break; }
  }
  st.listeners.length = 0;
  st.listeners.push(...orig);
  st.setTile(spots[0].x, spots[0].y, T.TALLGRASS, 0, 0);
  st.setTile(spots[1].x, spots[1].y, T.SAPLING, 0, 0);
  const rd0 = (p) => { const i = st.idx(p.x, p.y); return [st.type[i], st.frameX[i], st.frameY[i], st.flags[i]]; };
  const listeners = st.listeners.map((fn) => fn.name || String(fn).slice(0, 60));
  return { grass, t: spots[0], s: spots[1], tallV: T.TALLGRASS, sapV: T.SAPLING, killer, killerSrc: killer != null ? String(orig[killer]).slice(0, 300) : null, listeners, immediate: { tall: rd0(spots[0]), sap: rd0(spots[1]) } };
});
console.log('PLACEMENT', JSON.stringify(feats));
const readFrames = async (tag) => page.evaluate((f, tag) => {
  const st = window.__swGame.world.store;
  const rd = (p) => { const i = st.idx(p.x, p.y); return [st.type[i], st.frameX[i], st.frameY[i], st.flags[i]]; };
  return { tag, tall: rd(f.t), sap: rd(f.s), grass: rd(f.grass) };
}, feats, tag);
console.log(JSON.stringify(await readFrames('t0')));
await new Promise((r) => setTimeout(r, 1000));
console.log(JSON.stringify(await readFrames('t1s')));
await new Promise((r) => setTimeout(r, 2500));
console.log(JSON.stringify(await readFrames('t3.5s')));
await browser.close();
