import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const w = await mod.generateWorld({ width: 4200, height: 1200, seedText: 'dconn', name: 't' });
  const st = w.store;
  const DEFS = tiles.TILE_DEFS;
  const BRICKS = new Set(['v_41_blue_brick','v_43_green_brick','v_44_pink_brick'].map(k=>tiles.TILE_BY_KEY[k]));
  // 连续 ≥12 列在地表带都有 dungeon brick → 塔体
  let best = null;
  for (let x = 100; x < st.w - 100; x++) {
    let run = 0, yTop = -1;
    for (let xx = x; xx < x + 60; xx++) {
      let hit = -1;
      for (let y = Math.max(2, w.groundLevel - 60); y < w.groundLevel + 20; y++) {
        if (BRICKS.has(st.type[st.idx(xx,y)]) && st.flags[st.idx(xx,y)]) { hit = y; break; }
      }
      if (hit >= 0) { run++; if (yTop < 0) yTop = hit; } else if (run > 0) break;
    }
    if (run >= 12 && (!best || run > best.run)) best = { x, run, yTop };
    if (best && run >= 12) x += run;
  }
  if (!best) return { err: 'no tower cluster' };
  // 塔区逐层统计:实心砖列数/空气数/尖刺数(含地牢墙)
  const layers = [];
  for (let dy = -30; dy < 60; dy += 3) {
    let solid=0, air=0, spike=0, dwAir=0;
    for (let dx = -30; dx < 30; dx++) {
      const x = best.x + dx, y = best.yTop + dy;
      if (!st.inBounds(x,y)) continue;
      const i = st.idx(x,y);
      const t = st.type[i];
      if (BRICKS.has(t) && st.flags[i]) solid++;
      else if (t === tiles.TILE_BY_KEY['v_48_spike']) spike++;
      else if (!st.flags[i]) { air++; if (st.wall[i]>=7&&st.wall[i]<=9) dwAir++; }
    }
    layers.push({ dy, solid, air, dwAir, spike });
  }
  return { best, layers };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
