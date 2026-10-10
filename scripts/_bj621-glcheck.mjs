// BJ621 附探针 v2：groundLevel/rockLevel 修正带内场景 + 天光/火把照明 → 呈现层像素
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
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj621', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player && !!window.__swGame?.evolution, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1200));
const info = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  g.world.groundLevel = 100; g.world.rockLevel = 140;   // mock 世界深度带修正
  g.lighting.dirty = true;
  const tilesMod = await import('/src/data/tiles.ts');
  const S = (sheet) => { for (let id = 0; id < tilesMod.TILE_DEFS.length; id++) if (tilesMod.TILE_DEFS[id]?.vanilla?.sheet === sheet) return id; return -1; };
  const crystalId = S(129), stoneId = S(1), torchId = S(4);
  const sj = 150;                                        // 地下带（rockLevel 下方），全火把照明
  for (let x = 196; x < 226; x++) st.setTileSilent(x, sj, stoneId, 0, 0);
  for (let x = 196; x < 226; x++) for (let y = sj - 6; y < sj; y++) st.setTileSilent(x, y, 0, 0, 0);
  st.setTile(203, sj - 1, crystalId, 0, 0);       // 对照：碎块域
  st.setTile(207, sj - 1, crystalId, 324, 0);     // 实验：凝胶域
  st.setTile(201, sj - 1, torchId, 0, 0);
  st.setTile(205, sj - 1, torchId, 0, 0);
  st.setTile(209, sj - 1, torchId, 0, 0);
  st.setTile(211, sj - 1, torchId, 0, 0);
  g.chunks.markDirtyArea(195, sj - 7, 226, sj + 2);
  g.player.x = 206 * 16; g.player.y = (sj - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.player.cx = g.player.x; g.player.cy = g.player.y;
  const r = g.renderer, cam = g.camera;
  const glInfo = {
    zoom: cam.zoom, viewW: cam.viewW, viewH: cam.viewH,
    rendererKeys: Object.keys(r).filter((k) => /gl|acc|wr|gpu|ctx|canvas|lrecon/i.test(k)).slice(0, 30),
  };
  await new Promise((res) => setTimeout(res, 2500));
  const cam2 = g.camera;
  const pa = cam2.worldToScreen(203 * 16 + 8, (sj - 1) * 16 + 8);
  const pb = cam2.worldToScreen(207 * 16 + 8, (sj - 1) * 16 + 8);
  return { glInfo, proj: { a: pa, b: pb } };
});
console.log('INFO:', JSON.stringify(info));
const shot = await page.screenshot({ type: 'png' });
const { PNG } = await import('pngjs');
const png = PNG.sync.read(shot);
const analyze = (cx, cy, z) => {
  let opaque = 0, tot = 0, rs = 0, gs = 0, bs = 0, bright = 0;
  const half = Math.max(5, Math.round(8 * z));
  for (let dy = -half; dy < half; dy++) for (let dx = -half; dx < half; dx++) {
    const px = Math.round(cx + dx), py = Math.round(cy + dy);
    if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
    const idx = (py * png.width + px) * 4;
    tot++;
    if (png.data[idx + 3] > 10) {
      opaque++;
      rs += png.data[idx]; gs += png.data[idx + 1]; bs += png.data[idx + 2];
      if (png.data[idx] + png.data[idx + 1] + png.data[idx + 2] > 90) bright++;
    }
  }
  return { opaqueRate: tot ? +(opaque / tot).toFixed(3) : 0, brightRate: tot ? +(bright / tot).toFixed(3) : 0, avg: opaque ? [Math.round(rs / opaque), Math.round(gs / opaque), Math.round(bs / opaque)] : null };
};
console.log('SHOT:', png.width, png.height);
console.log('PIX_SHARD(fx=0):', JSON.stringify(analyze(info.proj.a[0], info.proj.a[1], info.glInfo.zoom)));
console.log('PIX_GEL(fx=324):', JSON.stringify(analyze(info.proj.b[0], info.proj.b[1], info.glInfo.zoom)));
await browser.close();
console.log('GLCHECK DONE');
