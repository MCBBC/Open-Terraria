// 全局定位地牢：按 x 桶统计地牢墙/砖（步进 4 采样），对比 world.dungeonX
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 120000 });
for (let a = 0; a < 3; a++) {
  try {
    await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
    break;
  } catch { await new Promise((r) => setTimeout(r, 1500)); }
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const bricks = new Set(['v_41_blue_brick', 'v_43_green_brick', 'v_44_pink_brick', 'v_481_cracked_blue_brick', 'v_482_cracked_green_dungeon_brick', 'v_483_cracked_pink_dungeon_brick'].map((k) => TILE_BY_KEY[k]));
  const buckets = new Map();
  for (let y = 20; y < st.h - 20; y += 3) {
    for (let x = 20; x < st.w - 20; x += 3) {
      const i = st.idx(x, y);
      const wl = st.wall[i];
      const isDw = wl === 7 || wl === 8 || wl === 9 || (wl >= 94 && wl <= 102);
      const isBr = st.flags[i] && bricks.has(st.type[i]);
      if (!isDw && !isBr) continue;
      const b = Math.floor(x / 200) * 200;
      const e = buckets.get(b) ?? { wall: 0, brick: 0 };
      if (isDw) e.wall++;
      else e.brick++;
      buckets.set(b, e);
    }
  }
  const arr = [...buckets.entries()].filter(([, v]) => v.wall + v.brick > 30).sort((a, b) => b[1].wall + b[1].brick - a[1].wall - a[1].brick);
  return {
    dungeonX: g.world.dungeonX, dungeonY: g.world.dungeonY, w: st.w, h: st.h, gl: g.world.groundLevel, rock: g.world.rockLevel,
    topBuckets: arr.slice(0, 5),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
