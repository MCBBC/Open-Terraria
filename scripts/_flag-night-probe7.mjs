// ★合格房(火把+桌+椅+平台门) + guide 入住 → tod 扫描:home 稳定性 + 旗布像素色(2026-10-05)
import { launchBrowser, openPage, bootstrap, createGame, godMode,
  freezeClock, saveCanvasShot, spawnTownNPC } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const TODS = (process.env.FLAG_TODS
  || '0.25,0.30,0.325,0.3333,0.35,0.4,0.5,0.55,0.6,0.625,0.64,0.65,0.66,0.6667,0.68,0.7,0.72,0.75,0.78,0.8125,0.85,0.9,0.0,0.1,0.2')
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
  const wood = s2.get(30), torch = s2.get(4), table = s2.get(14), chair = s2.get(15), plat = s2.get(19);
  for (let x = sx - 11; x <= sx + 11; x++) {
    for (let y = sy - 9; y <= sy + 3; y++) { const i = st.idx(x, y); st.setTile(x, y, 0, 0, 0); st.liquid[i] = 0; st.setWall(x, y, w2.has(4) ? w2.get(4) : 4); }
    st.setTile(x, sy - 9, wood, 0, 0);
    st.setTile(x, sy + 3, wood, 0, 0);
  }
  for (let y = sy - 8; y <= sy + 2; y++) { st.setTile(sx - 11, y, wood, 0, 0); st.setTile(sx + 11, y, wood, 0, 0); }
  // 家具:桌 3×1(锚左) / 椅 1×2(锚上) / 火把 / 平台门(地板开 3 格平台)
  st.setTile(sx - 6, sy + 2, table, 0, 0); st.setTile(sx - 5, sy + 2, table, 18, 0); st.setTile(sx - 4, sy + 2, table, 36, 0);
  st.setTile(sx - 6, sy + 1, chair, 0, 0); st.setTile(sx - 6, sy + 2, 0, 0, 0); st.setTile(sx - 6, sy + 2, chair, 0, 18);
  st.setTile(sx + 7, sy + 2, torch, 0, 0);
  st.setTile(sx + 9, sy + 3, 0, 0, 0); st.setTile(sx + 9, sy + 3, plat, 0, 0);  // 平台当门
  st.setTile(sx + 9, sy + 2, 0, 0, 0);
  g.player.x = sx * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = sx * 16; g.camera.y = sy * 16;
  return { sx, sy };
});
const npc = await spawnTownNPC(page, 'guide', { tx: scene.sx, ty: scene.sy + 2, home: { x: scene.sx, y: scene.sy + 2 } });
console.log('NPC', JSON.stringify(npc));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seen = [];
for (const tod of TODS) {
  await freezeClock(page, { tod });
  await sleep(900);
  const snap = await page.evaluate(async (sceneIn) => {
    const g = window.__swGame, r = g.renderer, cam = g.camera, st = g.world.store;
    const n = g.entities.npcs.find((x) => x.npcKey === 'guide');
    const { findBannerAnchorY, houseBannerVisible } = await import(`/src/world/Housing.ts?t=${Date.now()}`);
    const vis = houseBannerVisible(n);
    let px = null, anchor = null, lt = null, ltAir = null;
    if (n.home) {
      anchor = findBannerAnchorY(st, n.home.x, n.home.y);
      if (anchor != null) {
        lt = r.lighting?.lightAt(n.home.x, anchor) ?? null;
        ltAir = r.lighting?.lightAt(n.home.x, anchor + 1) ?? null;
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
      }
    }
    return { home: n.home ? [n.home.x, n.home.y] : null, vis, anchor, lt, ltAir, px };
  }, scene);
  await saveCanvasShot(page, `/tmp/flagnight7-t${String(tod).replace('.', '_')}.png`);
  console.log('TOD', tod, JSON.stringify(snap));
}
if (errs.length) console.log('PAGEERRORS', errs.slice(0, 6));
await browser.close();
