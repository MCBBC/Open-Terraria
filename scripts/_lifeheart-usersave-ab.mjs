// ★生命水晶用户存档复现 v2:填墙消背景抖动噪声+火把稳定照明+水晶自动定位。
// 三臂 A(2D)/B(bgl桥)/C(acc缺省) × 3 tick;中位数滤波;diff + 截屏。
// 运行: SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs --timeout=600000 scripts/_lifeheart-usersave-ab.mjs
import { launchBrowser, openPage, bootstrap, pump } from '../tools/probe/lib/index.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = '/tmp/lifeheart-ab';
mkdirSync(OUT, { recursive: true });
const SAVE = '/Users/vinlic/Downloads/map-Starter_World (34).json';

const browser = await launchBrowser({ viewport: { width: 1512, height: 862 } });
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await bootstrap(page, ORIGIN + '/?cloudcache=0');

const json = readFileSync(SAVE, 'utf8');
await page.evaluate(async (text) => {
  await window.__swFlow.loadJson(text);
  const g = window.__swGame;
  const r = g.renderer;
  window.__set = (bgl, shim) => { r.constructor.bglSetForTest(bgl); r.constructor.bglShimSetForTest(shim); };
  window.__setTick = async (n) => { const m = await import('/src/render/TileAnim.ts'); m.tileAnim.tick = n; };
}, json);
console.log('save loaded');

// 场景:水晶 (5917,893) 2×2;周边 16×14 填墙(消 wall=0 的抖动洞底噪声);
//   两侧火把;玩家移远;相机钉水晶。
const spot = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const TORCH = tiles.TILE_BY_KEY['torch'];
  const DIRTW = 30;   // dirt wall
  const cx = 5917, cy = 893;
  const heartType = st.type[st.idx(cx, cy)];   // 先取水晶 type(74),清场时保护
  // 保持用户原貌(wall=0 洞底抖动背景);只清周边杂物(保护水晶与石/土)
  for (let y = cy - 5; y <= cy + 6; y++) {
    for (let x = cx - 6; x <= cx + 7; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] !== heartType) st.setTileSilent(x, y, 0, 0, 0);
    }
  }
  // 校验水晶 4 格仍在
  const chk = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => {
    const i = st.idx(cx + dx, cy + dy);
    return { type: st.type[i], flags: st.flags[i], fx: st.frameX[i], fy: st.frameY[i] };
  });
  console.log('[in-page] heart cells:', JSON.stringify(chk));
  st.setTileSilent(cx - 4, cy + 2, TORCH, 0, 0);
  st.setTileSilent(cx + 5, cy + 2, TORCH, 0, 0);
  g.player.x = (cx + 7) * 16; g.player.y = (cy + 6) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.zoom = 1.18; g.camera.zoomTarget = 1.18;
  g.camera.x = cx * 16 + 16; g.camera.y = cy * 16 + 16;
  // 禁相机 follow(每帧缓动会拉回玩家位;探针需钉死取景)
  if (!window.__camFollowOrig) {
    window.__camFollowOrig = Object.getPrototypeOf(g.camera).follow;
    Object.getPrototypeOf(g.camera).follow = function () {};
  }
  g.lighting.dirty = true;
  window.__spot = { cx, cy };
  return { cx, cy };
});
console.log('spot', JSON.stringify(spot));
await page.evaluate(() => { window.__swGame.running = false; });

for (let i = 0; i < 40; i++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    const { cx, cy } = window.__spot;
    g.camera.x = cx * 16 + 16; g.camera.y = cy * 16 + 16;
    try { g.entities.npcs.length = 0; g.entities.enemies.length = 0; } catch { /* */ }
  });
  await pump(page, 1);
}

const Z = 4;
for (const [tag, bgl, shim] of [['A', false, false], ['C', true, true], ['S', true, true]]) {
  await page.evaluate((b, s) => window.__set(b, s), bgl, shim);
  await page.evaluate((t) => { globalThis.__SW_SHINE_OFF = (t === 'S'); }, tag);
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      const { cx, cy } = window.__spot;
      g.camera.x = cx * 16 + 16; g.camera.y = cy * 16 + 16;
      try { g.entities.npcs.length = 0; g.entities.enemies.length = 0; } catch { /* */ }
    });
    await pump(page, 1);
  }
  for (let k = 0; k < 3; k++) {
    await page.evaluate((n) => window.__setTick(180 + n * 24), k);
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const g = window.__swGame;
        const { cx, cy } = window.__spot;
        g.camera.x = cx * 16 + 16; g.camera.y = cy * 16 + 16;
        try { g.entities.npcs.length = 0; g.entities.enemies.length = 0; } catch { /* */ }
      });
      await pump(page, 1);
    }
    await page.evaluate((n) => window.__setTick(180 + n * 24), k);
    await pump(page, 1);
    const fin = await page.evaluate(async () => {
      const g = window.__swGame;
      const cam = g.camera;
      const { cx, cy } = window.__spot;
      const cv = g.renderer.canvas;
      const [sx0, sy0] = cam.worldToScreen(cx * 16 - 32, cy * 16 - 32);
      const [sx1, sy1] = cam.worldToScreen(cx * 16 + 48, cy * 16 + 48);
      const bx = Math.max(0, Math.floor(sx0)), by = Math.max(0, Math.floor(sy0));
      const bw = Math.min(cv.width - bx, Math.ceil(sx1) - bx), bh = Math.min(cv.height - by, Math.ceil(sy1) - by);
      const off = document.createElement('canvas');
      off.width = bw; off.height = bh;
      const c = off.getContext('2d', { willReadFrequently: true });
      c.drawImage(cv, bx, by, bw, bh, 0, 0, bw, bh);
      const d = c.getImageData(0, 0, bw, bh).data;
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
      return { w: bw, h: bh, b64: btoa(bin) };
    });
    writeFileSync(`${OUT}/v2-${tag}${k}.b64`, fin.b64);
    writeFileSync(`${OUT}/v2-${tag}${k}-meta.json`, JSON.stringify({ w: fin.w, h: fin.h }));
    const buf = Buffer.from(fin.b64, 'base64');
    const png = new PNG({ width: fin.w * Z, height: fin.h * Z });
    for (let y = 0; y < fin.h * Z; y++) for (let x = 0; x < fin.w * Z; x++) {
      const si = ((y / Z | 0) * fin.w + (x / Z | 0)) * 4;
      const di = (y * fin.w * Z + x) * 4;
      png.data[di] = buf[si]; png.data[di + 1] = buf[si + 1]; png.data[di + 2] = buf[si + 2]; png.data[di + 3] = 255;
    }
    writeFileSync(`${OUT}/v2-${tag}${k}.png`, PNG.sync.write(png));
  }
}
console.log('DONE');
await browser.close();
