// BJ621 呈现层终判：读 worldCanvas getImageData（GL 回贴面、乘光前原色）两格区域
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
const out = await page.evaluate(async () => {
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
  st.setTile(203, sj - 1, crystalId, 0, 0);
  st.setTile(207, sj - 1, crystalId, 324, 0);
  st.setTile(199, sj - 1, torchId, 0, 0);
  st.setTile(211, sj - 1, torchId, 0, 0);
  g.chunks.markDirtyArea(195, sj - 8, 226, sj + 2);
  g.player.x = 205 * 16; g.player.y = (sj - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.player.cx = g.player.x; g.player.cy = g.player.y;
  await new Promise((res) => setTimeout(res, 2200));
  const r = g.renderer, cam = g.camera;
  // 找世界层 canvas（GL 回贴面）
  const wc = r.worldCanvas || r.canvas;
  const wctx = wc.getContext('2d');
  if (!wctx) return { err: 'no 2d ctx on worldCanvas' };
  const read = (tx, ty) => {
    const [sx, sy] = cam.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    const x0 = Math.round(sx) - 9, y0 = Math.round(sy) - 9;
    const im = wctx.getImageData(x0, y0, 18, 18);
    let n = 0, rs = 0, gs = 0, bs = 0, opaque = 0;
    for (let k = 0; k < im.data.length; k += 4) {
      if (im.data[k + 3] > 10) { opaque++; rs += im.data[k]; gs += im.data[k + 1]; bs += im.data[k + 2]; }
      n++;
    }
    // 每像素行摘要（色相行剖面）
    const rows = [];
    for (let ry = 0; ry < 18; ry += 3) {
      let rsum = 0, gsum = 0, bsum = 0, cnt = 0;
      for (let rx = 0; rx < 18; rx++) {
        const k = ((ry * 18) + rx) * 4;
        if (im.data[k + 3] > 10) { rsum += im.data[k]; gsum += im.data[k + 1]; bsum += im.data[k + 2]; cnt++; }
      }
      rows.push(cnt ? [Math.round(rsum / cnt), Math.round(gsum / cnt), Math.round(bsum / cnt), cnt] : null);
    }
    return { avg: opaque ? [Math.round(rs / opaque), Math.round(gs / opaque), Math.round(bs / opaque)] : null, opaque, rows };
  };
  return {
    wcSize: [wc.width, wc.height],
    shard: read(203, sj - 1),
    gel: read(207, sj - 1),
    fx: { a: st.frameX[st.idx(203, sj - 1)], b: st.frameX[st.idx(207, sj - 1)] },
  };
});
console.log('PIXREAD:', JSON.stringify(out, null, 1));
await browser.close();
