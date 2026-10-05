// ★NPC房屋旗帜夜间白背景 定谳探针 v2(2026-10-05)
// 真实 NPC 住房 + drawHouseBanners 仪表化(拦截 lighting.lightAt 记录取样坐标/值)
// + 精细 tod 扫描:旗布区白度 + 实心行/空气行光照对拍 → 验证 16:00/8:00 窗口机制。
import { launchBrowser, openPage, bootstrap, createGame, godMode,
  freezeClock, saveCanvasShot, spawnTownNPC } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const OUT = process.env.FLAG_OUT || '/tmp/flagnight2';
const TODS = (process.env.FLAG_TODS
  || '0.28,0.30,0.31,0.32,0.325,0.33,0.3333,0.34,0.35,0.4,0.5,0.55,0.6,0.62,0.64,0.65,0.66,0.6667,0.675,0.69,0.7,0.72,0.75,0.8125,0.0')
  .split(',').map(Number);
const TORCH = process.env.FLAG_TORCH !== '0';   // 缺省房内有火把;=0 复现无光源暗房

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await godMode(page, true);

// ---------- 建房 ----------
const scene = await page.evaluate(async (torch) => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS, WALL_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const sheet2id = new Map(), wallSheet2id = new Map();
  TILE_DEFS.forEach((d, i) => { if (d?.vanilla && !sheet2id.has(d.vanilla.sheet)) sheet2id.set(d.vanilla.sheet, i); });
  WALL_DEFS.forEach((d, i) => { if (d?.vanilla && !wallSheet2id.has(d.vanilla.sheet)) wallSheet2id.set(d.vanilla.sheet, i); });
  const W = (s) => (wallSheet2id.has(s) ? wallSheet2id.get(s) : s);
  const sx = Math.floor(g.player.cx / 16), sy = Math.floor(g.player.cy / 16);
  const wood = sheet2id.get(30);
  for (let x = sx - 11; x <= sx + 11; x++) {
    for (let y = sy - 9; y <= sy + 3; y++) {
      const i = st.idx(x, y);
      st.setTile(x, y, 0, 0, 0); st.liquid[i] = 0;
      st.setWall(x, y, W(4));
    }
    st.setTile(x, sy - 9, wood, 0, 0);
    st.setTile(x, sy + 3, wood, 0, 0);
  }
  for (let y = sy - 8; y <= sy + 2; y++) {
    st.setTile(sx - 11, y, wood, 0, 0);
    st.setTile(sx + 11, y, wood, 0, 0);
  }
  if (torch) st.setTile(sx + 7, sy + 2, sheet2id.get(4), 0, 0);   // 火把(可选)
  g.player.x = sx * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = sx * 16; g.camera.y = sy * 16;
  return { sx, sy };
}, TORCH);
console.log('SCENE', JSON.stringify(scene), 'TORCH', TORCH);

// NPC 入住:站格 sy+2,home={sx, sy+2}
const npc = await spawnTownNPC(page, 'guide', { tx: scene.sx, ty: scene.sy + 2, home: { x: scene.sx, y: scene.sy + 2 } });
console.log('NPC', JSON.stringify(npc));

// ---------- 仪表:drawHouseBanners 拦 lightAt + 旗布屏矩形 ----------
await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  const proto = Object.getPrototypeOf(r);
  const orig = proto.drawHouseBanners;
  window.__hb = { calls: 0, lts: [], geom: null };
  proto.drawHouseBanners = function (...a) {
    window.__hb.calls++;
    const L = this.lighting;
    if (L) {
      const origLA = L.lightAt.bind(L);
      L.lightAt = (x, y, ...rest) => {
        const v = origLA(x, y, ...rest);
        if (window.__hb.lts.length < 40) window.__hb.lts.push([x, y, v[0], v[1], v[2]]);
        return v;
      };
      try { return orig.apply(this, a); } finally { L.lightAt = origLA; }
    }
    return orig.apply(this, a);
  };
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
for (const tod of TODS) {
  await freezeClock(page, { tod });
  await sleep(900);
  const snap = await page.evaluate((sceneIn) => {
    const g = window.__swGame, st = g.world.store, cam = g.camera, r = g.renderer;
    // 复算旗几何(findBannerAnchorY 同式)
    const hx = sceneIn.sx, hy = sceneIn.sy + 2;
    let cy = hy - 1;
    while (cy >= 10) { const i = st.idx(hx, cy); if (st.flags[i] && st.type[i] && st.solidLike ? 0 : 0) break; cy--; }
    // 直接 import Housing 的 findBannerAnchorY 保真
    return (async () => {
      const { findBannerAnchorY } = await import(`/src/world/Housing.ts?t=${Date.now()}`);
      const anchor = findBannerAnchorY(st, hx, hy);
      const la = (x, y) => (r.lighting ? r.lighting.lightAt(x, y) : [0, 0, 0]);
      const ltSolid = anchor != null ? la(hx, anchor) : null;      // 本仓现行取样
      const ltAir = anchor != null ? la(hx, anchor + 1) : null;    // 原版 num3++ 语义
      const ltFloor = la(hx, hy);                                  // NPC 站格(房中空气)
      // 旗布屏矩形白度
      const cv = r.glCanvasEl ?? r.swPipe?.canvas ?? r.canvas;
      let whiteFrac = null, mean = null;
      if (cv && cv.width && anchor != null) {
        const bx = hx * 16 + 8, by = (anchor + 1) * 16 + 18;
        const [scx, scy] = cam.worldToScreen(bx, by);
        const c2 = document.createElement('canvas');
        c2.width = cv.width; c2.height = cv.height;
        const ctx = c2.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(cv, 0, 0);
        const img = ctx.getImageData(0, 0, c2.width, c2.height);
        const R = 20 * cam.zoom, step = 2;
        let n = 0, w = 0, rs = 0, gs = 0, bs = 0;
        for (let dy = -R; dy <= R; dy += step) for (let dx = -R; dx <= R; dx += step) {
          const x = Math.round(scx + dx), y = Math.round(scy + dy);
          if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
          const k = (y * img.width + x) * 4;
          const pr = img.data[k], pg = img.data[k + 1], pb = img.data[k + 2];
          n++; rs += pr; gs += pg; bs += pb;
          if (pr >= 235 && pg >= 235 && pb >= 235) w++;
        }
        whiteFrac = n ? +(w / n).toFixed(3) : null;
        mean = n ? [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)] : null;
      }
      return { anchor, ltSolid, ltAir, ltFloor, hb: { calls: window.__hb.calls, lts: window.__hb.lts.slice(0, 6) }, whiteFrac, mean };
    })();
  }, scene);
  await saveCanvasShot(page, `${OUT}/t${String(tod).replace('.', '_')}.png`);
  rows.push({ tod, ...snap });
  console.log('TOD', tod, 'anchor', snap.anchor, 'ltSolid', JSON.stringify(snap.ltSolid),
    'ltAir', JSON.stringify(snap.ltAir), 'ltFloor', JSON.stringify(snap.ltFloor),
    'white', snap.whiteFrac, 'mean', JSON.stringify(snap.mean), 'hb', JSON.stringify(snap.hb));
}
console.log('=== SUMMARY ===');
for (const r of rows) console.log(r.tod, r.anchor, JSON.stringify(r.ltSolid), JSON.stringify(r.ltAir), r.whiteFrac);
if (errs.length) console.log('PAGEERRORS', errs.slice(0, 6));
await browser.close();
