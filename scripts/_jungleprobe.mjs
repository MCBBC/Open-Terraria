// 丛林肉前出怪验证：玩家站丛林草上跑 tick → 统计 vanillaId 池
// 期望（原版 L3839-3856）：深层 204/43/黄蜂族(231-235,-56..-65,42)/浅层 51/56；绝无 158
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 120000 });
for (let a = 0; a < 3; a++) {
  try { await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); }); break; }
  catch { await new Promise((r) => setTimeout(r, 1500)); }
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const JG = TILE_BY_KEY['v_60_jungle_grass_block'];
  // 找丛林草列：扫 jungleX 附近地表与浅层
  const jx = g.world.jungleX || Math.floor(st.w * 0.15);
  let spot = null;
  outer:
  for (let dx = -80; dx <= 80; dx++) {
    for (let dy = -20; dy <= 40; dy++) {
      const x = jx + dx, y = Math.floor(g.world.groundLevel) + dy;
      if (x < 5 || y < 5 || x > st.w - 5 || y > st.h - 5) continue;
      if (st.type[st.idx(x, y)] !== JG) continue;
      if (!st.isSolid(x, y) || st.isSolid(x, y - 1) || st.isSolid(x, y - 2)) continue;
      spot = { x, y };
      break outer;
    }
  }
  if (!spot) return { spot: 0, jx };
  g.player.x = (spot.x + 0.5) * 16 - g.player.w / 2;
  g.player.y = (spot.y - 3) * 16;
  g.world.clock.timeOfDay = 0.5; // 白天
  const ids = {};
  // 埋点：spawn 调用/落空/选中 + 时间
  const vs = g.vanillaSpawner;
  const origSpawn = vs.spawn.bind(vs);
  const stats = { calls: 0, picked: 0, nulls: 0 };
  vs.spawn = (px, py, rng, vw, vh) => {
    stats.calls++;
    const r = origSpawn(px, py, rng, vw, vh);
    if (r) stats.picked++; else stats.nulls++;
    return r;
  };
  for (let k = 0; k < 6000; k++) {
    g.fixedUpdate(1 / 60);
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
  }
  vs.spawn = origSpawn;
  for (const e of g.entities.enemies) {
    if (e.dead || e.vanillaId == null) continue;
    ids[e.vanillaId] = (ids[e.vanillaId] ?? 0) + 1;
  }
  return { spot, depth: spot.y - Math.floor(g.world.groundLevel), midY: ((g.world.groundLevel + g.world.rockLevel) / 2 - g.world.groundLevel) | 0, ids, stats };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
