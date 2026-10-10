// ★BJ621 终态呈现层取证：强光+zoom 拉近+GLShimExecutor 交叉钩→整帧/特写截图落盘
// docs/evidence/bj621/（用户亲核物证：真机渲染明胶水晶 tile 129 fx>=324 的屏面像素）
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
  g.world.groundLevel = 100; g.world.rockLevel = 140;
  g.lighting.dirty = true;
  const tilesMod = await import('/src/data/tiles.ts');
  const S = (sheet) => { for (let id = 0; id < tilesMod.TILE_DEFS.length; id++) if (tilesMod.TILE_DEFS[id]?.vanilla?.sheet === sheet) return id; return -1; };
  const crystalId = S(129), stoneId = S(1), torchId = S(4);
  const sj = 150;
  for (let x = 190; x < 232; x++) st.setTileSilent(x, sj, stoneId, 0, 0);
  for (let x = 190; x < 232; x++) for (let y = sj - 7; y < sj; y++) st.setTileSilent(x, y, 0, 0, 0);
  // 三格对照：碎块域 style0 / 凝胶域 phase0 / 凝胶域 phase1（演化产物同款 fx 域）
  st.setTile(206, sj - 1, crystalId, 0, 0);
  st.setTile(210, sj - 1, crystalId, 324, 0);
  st.setTile(214, sj - 1, crystalId, 342, 0);
  // 贴脸火把强光（每格旁边各一支）
  for (const tx of [204, 208, 212, 216]) st.setTile(tx, sj - 1, torchId, 0, 0);
  g.chunks.markDirtyArea(189, sj - 9, 233, sj + 2);
  g.player.x = 210 * 16; g.player.y = (sj - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.player.cx = g.player.x; g.player.cy = g.player.y;
  // GL shim 交叉钩（同帧图集采样点记录）
  const mod = await import('/src/render/glshim/GLShimExecutor.ts');
  const proto = mod.GLShimExecutor.prototype;
  const orig = proto.drawImage;
  window.__bj621rec = [];
  if (!window.__bj621hooked) {
    window.__bj621hooked = true;
    proto.drawImage = function (img, ...rest) {
      try {
        if (img?.width === 432 && img?.height === 144 && rest.length >= 7) {
          window.__bj621rec.push({ sx: rest[0], sy: rest[1], sw: rest[2], sh: rest[3] });
        }
      } catch { /* ignore */ }
      return orig.apply(this, [img, ...rest]);
    };
  }
  // zoom 拉近（camera 缓动目标+直接落位）
  g.camera.zoomTarget = 3;
  g.camera.zoom = 3;
  await new Promise((res) => setTimeout(res, 2500));
  const cam = g.camera;
  const pj = (tx, ty) => { const [x, y] = cam.worldToScreen(tx * 16 + 8, (sj - 1) * 16 + 8); return { x: Math.round(x), y: Math.round(y) }; };
  return {
    zoom: cam.zoom,
    proj: { shard: pj(206, sj - 1), gel0: pj(210, sj - 1), gel1: pj(214, sj - 1) },
    store: { shard: st.frameX[st.idx(206, sj - 1)], gel0: st.frameX[st.idx(210, sj - 1)], gel1: st.frameX[st.idx(214, sj - 1)] },
    worldTile: sj - 1,
  };
});
console.log('META:', JSON.stringify(meta));
const rec = await page.evaluate(() => window.__bj621rec.slice(0, 500));
const hist = {};
for (const r of rec) { const k = `x${r.sx}_y${r.sy}`; hist[k] = (hist[k] || 0) + 1; }
console.log('SHIM_SX_HIST:', JSON.stringify(hist));
console.log('SHIM_TOTAL:', rec.length);
await page.screenshot({ path: `${OUT}/bj621-full-frame.png`, type: 'png' });
console.log('FULL FRAME SAVED');
await browser.close();
console.log('EVIDENCE DONE');
