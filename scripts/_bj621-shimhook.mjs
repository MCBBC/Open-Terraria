// BJ621 shim 层取证：hook GLShimExecutor.prototype.drawImage（主渲染 acc 面真帧序列）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1200));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
// 先装 shim 钩（进世界前，保证类的同一实例）
await page.evaluate(async () => {
  const mod = await import('/src/render/glshim/GLShimExecutor.ts');
  const proto = mod.GLShimExecutor.prototype;
  const orig = proto.drawImage;
  window.__bj621 = { rec: [] };
  proto.drawImage = function (img, ...rest) {
    try {
      const w = img?.width, h = img?.height;
      if (w === 432 && h === 144) {
        const a = rest;
        // 9 参: (sx,sy,sw,sh,dx,dy,dw,dh) after img；5 参: (dx,dy,dw,dh)；3 参: (dx,dy)
        const sx = a.length >= 7 ? a[0] : null, sy = a.length >= 7 ? a[1] : null;
        window.__bj621.rec.push({ args: a.length, sx, sy, sw: a.length >= 7 ? a[2] : null, sh: a.length >= 7 ? a[3] : null });
      }
    } catch { /* ignore */ }
    return orig.apply(this, [img, ...rest]);
  };
});
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
  window.__bj621.rec.length = 0;
  await new Promise((res) => setTimeout(res, 2500));
  return { recCount: window.__bj621.rec.length, rec: window.__bj621.rec.slice(0, 200) };
});
console.log('SHIM_REC count:', out.recCount);
const hist = {};
for (const r of out.rec) { const k = `x${r.sx}_y${r.sy}`; hist[k] = (hist[k] || 0) + 1; }
console.log('SHIM_SX_HIST:', JSON.stringify(hist));
await browser.close();
