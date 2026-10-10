// BJ621 终极取证：实例级 hook worldCtxLayer + _accMode + chunk 烘焙图 129 域扫描
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
  // 实例级 hook：worldCtxLayer + 全 canvas getContext 侧录
  const r = g.renderer;
  const accMode0 = r._accMode;
  const rec = [];
  const hookCtx = (name) => {
    const c = name === 'wc' ? r.worldCtxLayer : r.ctx;
    if (!c) return 'missing';
    const orig = c.drawImage.bind(c);
    c.drawImage = function (img, sx, sy, ...rest) {
      try {
        if (img && img.width === 432 && img.height === 144) rec.push({ via: name, sx, sy, sw: arguments[3], sh: arguments[4] });
      } catch { /* ignore */ }
      return orig(img, sx, sy, ...rest);
    };
    return 'ok';
  };
  const h1 = hookCtx('wc'), h2 = hookCtx('main');
  await new Promise((res) => setTimeout(res, 2500));
  // chunk 烘焙图取证：两格所在 chunk 的 tile canvas 像素
  const CH = 16;
  const cx = 203 / CH | 0, cy = (sj - 1) / CH | 0;
  const pair = g.chunks.get(cx, cy);
  let chunkInfo = null;
  if (pair && pair.tile) {
    const tctx = pair.tile.getContext ? pair.tile.getContext('2d') : null;
    if (tctx) {
      const lx = (203 % CH) * 16, ly = ((sj - 1) % CH) * 16;
      const imA = tctx.getImageData(lx, ly, 16, 16);
      let nA = 0;
      for (let k = 0; k < imA.data.length; k += 4) if (imA.data[k + 3] > 10) nA++;
      const imB = tctx.getImageData((207 % CH) * 16, ly, 16, 16);
      let nB = 0;
      for (let k = 0; k < imB.data.length; k += 4) if (imB.data[k + 3] > 10) nB++;
      chunkInfo = { shardPx: nA, gelPx: nB, tileCtor: pair.tile.constructor?.name };
    } else chunkInfo = { tileCtor: pair.tile.constructor?.name, no2d: true };
  } else chunkInfo = 'no-pair';
  return {
    accMode0, accModeAfter: r._accMode, h1, h2,
    recCount: rec.length, rec: rec.slice(0, 60),
    bglPathStats: { ...r.bglPathStats },
    chunkInfo,
    fx: { a: st.frameX[st.idx(203, sj - 1)], b: st.frameX[st.idx(207, sj - 1)] },
  };
});
console.log('FINAL:', JSON.stringify(out, null, 1));
await browser.close();
