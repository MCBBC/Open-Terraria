// spawner 接受率诊断：固定场景直调 1000 次 spawn 统计落点
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  // 腐化草地（同 biomeprobe 场景 A）
  const keys = window.__swTiles;
  const cg = keys['v_23_corrupt_grass_block'];
  for (let dx = -110; dx <= 110; dx++) {
    st.setTile(px0 + dx, gy, cg);
    st.setTile(px0 + dx, gy + 1, keys['dirt']);
  }
  g.player.x = px0 * 16; g.player.y = (gy - 4) * 16;
  g.world.clock.timeOfDay = 0.5;
  const rngCls = g.constructor; void rngCls;
  // 用 Math.random 包装 RNG 不可行——直接造一个简单 rng
  const mk = (seed) => {
    let s = seed >>> 0;
    return {
      next() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; },
      int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); },
    };
  };
  // vanillaSpawner 懒创建：先步进让 trySpawnEnemy 触发一次
  for (let i = 0; i < 600 && !g.vanillaSpawner; i++) g.fixedUpdate(1 / 60);
  if (!g.vanillaSpawner) return { err: 'vanillaSpawner 未创建' };
  const viewHalfW = Math.ceil(g.camera.viewW / (g.camera.zoom || 1) / 2 / 16);
  const viewHalfH = Math.ceil(g.camera.viewH / (g.camera.zoom || 1) / 2 / 16);
  let ok = 0;
  const dist = [];
  const ids = {};
  for (let i = 0; i < 2; i++) {
    const e = g.vanillaSpawner.spawn(g.player.cx, g.player.cy, mk(i * 7919 + 13), viewHalfW, viewHalfH);
    if (e) {
      ok++;
      dist.push([g.vanillaSpawner.currentSpawnX - px0, g.vanillaSpawner.currentSpawnY - gy]);
      ids[e.vanillaId] = (ids[e.vanillaId] || 0) + 1;
    }
  }
  return {
    viewHalfW, viewHalfH,
    okRate: +(ok / 2).toFixed(3),
    ids,
    sampleDists: dist.slice(0, 10),
    dxHist: dist.reduce((m, d) => { const k = Math.abs(d[0]) < 35 ? 'in-safeX' : 'out-safeX'; m[k] = (m[k] || 0) + 1; return m; }, {}),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
