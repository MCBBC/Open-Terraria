// ★决定性复现:内部楼板锚(不露天)+无火把+窗光气路 → 夜间楼板光归零 → 白旗?
// 两层房:下房=旗房(无光源),上房=密封阁楼;楼板=锚行;左墙开 2×2 玻璃窗换气光。
import { launchBrowser, openPage, bootstrap, createGame, godMode,
  freezeClock, saveCanvasShot, spawnTownNPC } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const TODS = (process.env.FLAG_TODS || '0.55,0.6,0.62,0.64,0.65,0.66,0.67,0.68,0.7,0.72,0.75,0.8125,0.9,0.0,0.1,0.2,0.25,0.28,0.30,0.31,0.32,0.33,0.35,0.4,0.5')
  .split(',').map(Number);

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await godMode(page, true);

const scene = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS, WALL_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const s2 = new Map(), w2 = new Map();
  TILE_DEFS.forEach((d, i) => { if (d?.vanilla && !s2.has(d.vanilla.sheet)) s2.set(d.vanilla.sheet, i); });
  WALL_DEFS.forEach((d, i) => { if (d?.vanilla && !w2.has(d.vanilla.sheet)) w2.set(d.vanilla.sheet, i); });
  const sx = Math.floor(g.player.cx / 16), sy = Math.floor(g.player.cy / 16);
  const wood = s2.get(30), glass = s2.get(54);
  const L = sx - 11, R = sx + 11;
  const FLOOR = sy + 3, SLAB = sy - 5, TOP = sy - 13;   // 下房:SLAB+1..FLOOR-1;上房:TOP+1..SLAB-1
  // 全清+墙
  for (let x = L; x <= R; x++) for (let y = TOP - 1; y <= FLOOR; y++) {
    const i = st.idx(x, y); st.setTile(x, y, 0, 0, 0); st.liquid[i] = 0; st.setWall(x, y, w2.has(4) ? w2.get(4) : 4);
  }
  // 边界:地板/楼板/顶/侧壁(侧壁全高封死)
  for (let x = L; x <= R; x++) { st.setTile(x, FLOOR, wood, 0, 0); st.setTile(x, SLAB, wood, 0, 0); st.setTile(x, TOP, wood, 0, 0); }
  for (let y = TOP + 1; y <= FLOOR - 1; y++) { st.setTile(L, y, wood, 0, 0); st.setTile(R, y, wood, 0, 0); }
  // 窗:下房左墙 2×2 挖洞填玻璃(玻璃非实心=气光路)
  st.setTile(L, sy - 2, glass, 0, 0); st.setTile(L, sy - 1, glass, 0, 0);
  st.setTile(L, sy - 3, glass, 0, 0); st.setTile(L, sy, glass, 0, 0);
  // 阁楼密封(无开口)
  g.player.x = sx * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = sx * 16; g.camera.y = sy * 16;
  return { sx, sy, L, R, FLOOR, SLAB, TOP };
});
// guide 入住下房(home 每轮被复核清也无所谓——渲染直读 home,取样时重挂)
await spawnTownNPC(page, 'guide', { tx: scene.sx, ty: scene.sy + 2, home: { x: scene.sx, y: scene.sy + 2 } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const tod of TODS) {
  await freezeClock(page, { tod });
  await sleep(900);
  const snap = await page.evaluate(async (sceneIn) => {
    const g = window.__swGame, r = g.renderer, cam = g.camera, st = g.world.store;
    const n = g.entities.npcs.find((x) => x.npcKey === 'guide');
    if (n && !n.home) n.home = { x: sceneIn.sx, y: sceneIn.sy + 2 };   // 重挂(复核驱逐兜底)
    const { findBannerAnchorY } = await import(`/src/world/Housing.ts?t=${Date.now()}`);
    const anchor = findBannerAnchorY(st, n.home.x, n.home.y);
    const la = (x, y) => (r.lighting ? r.lighting.lightAt(x, y) : [0, 0, 0]);
    const lt = la(n.home.x, anchor), ltAir = la(n.home.x, anchor + 1), ltOut = la(sceneIn.L - 2, n.home.y);
    let px = null;
    const bx = n.home.x * 16 + 8, by = (anchor + 1) * 16 + 18;
    const [scx, scy] = cam.worldToScreen(bx, by);
    const cv = r.glCanvasEl ?? r.swPipe?.canvas ?? r.canvas;
    if (cv && cv.width) {
      const c2 = document.createElement('canvas');
      c2.width = cv.width; c2.height = cv.height;
      const ctx = c2.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(cv, 0, 0);
      const im = ctx.getImageData(Math.max(0, Math.round(scx) - 16), Math.max(0, Math.round(scy) - 20), 33, 41);
      let rs = 0, gs = 0, bs = 0, cnt = 0, w = 0;
      for (let k = 0; k < im.data.length; k += 4) {
        rs += im.data[k]; gs += im.data[k + 1]; bs += im.data[k + 2]; cnt++;
        if (im.data[k] >= 225 && im.data[k + 1] >= 225 && im.data[k + 2] >= 225) w++;
      }
      px = { mean: [Math.round(rs / cnt), Math.round(gs / cnt), Math.round(bs / cnt)], white: +(w / cnt).toFixed(3) };
    }
    return { anchor, lt, ltAir, ltOut, px };
  }, scene);
  await saveCanvasShot(page, `/tmp/flagnight11-t${String(tod).replace('.', '_')}.png`);
  console.log('TOD', tod, 'anchor', snap.anchor, 'lt', JSON.stringify(snap.lt), 'ltAir', JSON.stringify(snap.ltAir),
    'ltOut', JSON.stringify(snap.ltOut), 'px', JSON.stringify(snap.px));
}
if (errs.length) console.log('PAGEERRORS', errs.slice(0, 6));
await browser.close();
