// ★BJ621 终态取证 v2：地表露天（天光满亮、玩家存活、无横幅污染）→ 三格特写
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const OUT = 'docs/evidence/bj621';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1200));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj621-probe');
  for (const id of ['sw-boot-prime', 'sw-splash']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj621', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player && !!window.__swGame?.evolution, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const ok = btns.find((b) => /我已知晓|知晓|知道了|OK|确认/.test(b.textContent || ''));
  if (ok) ok.click();
  [...document.querySelectorAll('div')].forEach((d) => {
    const s = getComputedStyle(d);
    if (s.position === 'fixed' && s.zIndex > 500 && (d.textContent || '').includes('欢迎来到')) d.style.display = 'none';
  });
});
const meta = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 地表带：groundLevel=100 → 天光满亮带 j<100；场景 j=92 露天
  g.world.groundLevel = 100; g.world.rockLevel = 140;
  g.lighting.dirty = true;
  const tilesMod = await import('/src/data/tiles.ts');
  const S = (sheet) => { for (let id = 0; id < tilesMod.TILE_DEFS.length; id++) if (tilesMod.TILE_DEFS[id]?.vanilla?.sheet === sheet) return id; return -1; };
  const crystalId = S(129), stoneId = S(1);
  const sj = 92;                                     // 露天（groundLevel 上方天光带）
  for (let x = 190; x < 232; x++) st.setTileSilent(x, sj, stoneId, 0, 0);
  for (let x = 190; x < 232; x++) for (let y = sj - 7; y < sj; y++) st.setTileSilent(x, y, 0, 0, 0);
  st.setTile(204, sj - 1, crystalId, 0, 0);          // 碎块域 style0
  st.setTile(208, sj - 1, crystalId, 324, 0);        // 凝胶域 phase0
  st.setTile(212, sj - 1, crystalId, 342, 0);        // 凝胶域 phase1
  g.chunks.markDirtyArea(189, sj - 9, 233, sj + 2);
  g.player.x = 217 * 16; g.player.y = sj * 16 - 43;   // 脚底=92行石头面,头在露天带 g.player.vx = 0; g.player.vy = 0;
  g.player.cx = g.player.x; g.player.cy = g.player.y;
  g.player.dead = false; g.player.hp = g.player.hpMax ?? 100;
  g.camera.zoomTarget = 3; g.camera.zoom = 3;
  await new Promise((res) => setTimeout(res, 5000));   // 相机缓动收敛
  g.player.dead = false; g.player.hp = g.player.hpMax ?? 100;   // 保险再清一次死亡态
  await new Promise((res) => setTimeout(res, 400));
  const cam = g.camera;
  const pj = (tx, ty) => { const [x, y] = cam.worldToScreen(tx * 16 + 8, (sj - 1) * 16 + 8); return { x: Math.round(x), y: Math.round(y) }; };
  return {
    zoom: cam.zoom, dead: g.player.dead,
    proj: { shard: pj(204, sj - 1), gel0: pj(208, sj - 1), gel1: pj(212, sj - 1) },
    store: { shard: st.frameX[st.idx(204, sj - 1)], gel0: st.frameX[st.idx(208, sj - 1)], gel1: st.frameX[st.idx(212, sj - 1)] },
  };
});
console.log('META:', JSON.stringify(meta));
await page.screenshot({ path: `${OUT}/bj621-full-frame.png`, type: 'png' });
await browser.close();
console.log('EVIDENCE2 DONE');
