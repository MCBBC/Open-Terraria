// BJ621 附探针 v4：点掉欢迎覆层后截图两 tile 区域
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
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
await new Promise((r) => setTimeout(r, 800));
// 点掉欢迎覆层（含后备：任意 .sw-announce 按钮/遮罩移除）
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const ok = btns.find((b) => /我已知晓|知晓|知道了|OK|确认/.test(b.textContent || ''));
  if (ok) ok.click();
  const ovl = [...document.querySelectorAll('div')].filter((d) => {
    const s = getComputedStyle(d);
    return s.position === 'fixed' && s.zIndex > 500 && (d.textContent || '').includes('欢迎来到');
  });
  ovl.forEach((d) => { d.style.display = 'none'; });
});
await new Promise((r) => setTimeout(r, 400));
const projInfo = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  g.world.groundLevel = 100; g.world.rockLevel = 140;
  g.lighting.dirty = true;
  const tilesMod = await import('/src/data/tiles.ts');
  const S = (sheet) => { for (let id = 0; id < tilesMod.TILE_DEFS.length; id++) if (tilesMod.TILE_DEFS[id]?.vanilla?.sheet === sheet) return id; return -1; };
  const crystalId = S(129), stoneId = S(1), torchId = S(4);
  const sj = 150;
  for (let x = 196; x < 226; x++) st.setTileSilent(x, sj, stoneId, 0, 0);
  for (let x = 196; x < 226; x++) for (let y = sj - 6; y < sj; y++) st.setTileSilent(x, y, 0, 0, 0);
  st.setTile(203, sj - 1, crystalId, 0, 0);       // 对照：碎块域
  st.setTile(207, sj - 1, crystalId, 324, 0);     // 实验：凝胶域
  st.setTile(200, sj - 1, torchId, 0, 0);
  st.setTile(210, sj - 1, torchId, 0, 0);
  g.chunks.markDirtyArea(195, sj - 8, 226, sj + 2);
  g.player.x = 206 * 16; g.player.y = (sj - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.player.cx = g.player.x; g.player.cy = g.player.y;
  await new Promise((res) => setTimeout(res, 2500));
  const cam = g.camera;
  const pa = cam.worldToScreen(203 * 16 + 8, (sj - 1) * 16 + 8);
  const pb = cam.worldToScreen(207 * 16 + 8, (sj - 1) * 16 + 8);
  return { a: pa, b: pb, zoom: cam.zoom };
});
console.log('PROJ:', JSON.stringify(projInfo));
await page.screenshot({ path: '/tmp/bj621-full2.png', type: 'png' });
console.log('SAVED');
await browser.close();
