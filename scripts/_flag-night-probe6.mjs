// ★逐 tod 跟踪 NPC home/homeless/houseBannerVisible + 旗布矩形像素(2026-10-05)
import { launchBrowser, openPage, bootstrap, createGame, godMode,
  freezeClock, saveCanvasShot, spawnTownNPC } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const TODS = (process.env.FLAG_TODS || '0.30,0.3333,0.4,0.5,0.6,0.625,0.65,0.6667,0.7,0.8125,0.9,0.0,0.2')
  .split(',').map(Number);

const browser = await launchBrowser({});
const page = await openPage(browser, {});
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
  const wood = s2.get(30);
  for (let x = sx - 11; x <= sx + 11; x++) {
    for (let y = sy - 9; y <= sy + 3; y++) { const i = st.idx(x, y); st.setTile(x, y, 0, 0, 0); st.liquid[i] = 0; st.setWall(x, y, w2.has(4) ? w2.get(4) : 4); }
    st.setTile(x, sy - 9, wood, 0, 0); st.setTile(x, sy + 3, wood, 0, 0);
  }
  for (let y = sy - 8; y <= sy + 2; y++) { st.setTile(sx - 11, y, wood, 0, 0); st.setTile(sx + 11, y, wood, 0, 0); }
  g.player.x = sx * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = sx * 16; g.camera.y = sy * 16;
  return { sx, sy };
});
await spawnTownNPC(page, 'guide', { tx: scene.sx, ty: scene.sy + 2, home: { x: scene.sx, y: scene.sy + 2 } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const tod of TODS) {
  await freezeClock(page, { tod });
  await sleep(900);
  const snap = await page.evaluate(async (sceneIn) => {
    const g = window.__swGame, r = g.renderer, cam = g.camera, st = g.world.store;
    const n = g.entities.npcs[0];
    const { findBannerAnchorY, houseBannerVisible } = await import(`/src/world/Housing.ts?t=${Date.now()}`);
    const vis = houseBannerVisible(n);
    let anchor = null, px = null;
    if (n.home) {
      anchor = findBannerAnchorY(st, n.home.x, n.home.y);
      if (anchor != null) {
        const bx = n.home.x * 16 + 8, by = (anchor + 1) * 16 + 18;
        const [scx, scy] = cam.worldToScreen(bx, by);
        const cv = r.glCanvasEl ?? r.swPipe?.canvas ?? r.canvas;
        if (cv && cv.width) {
          const c2 = document.createElement('canvas');
          c2.width = cv.width; c2.height = cv.height;
          const ctx = c2.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(cv, 0, 0);
          const im = ctx.getImageData(Math.round(scx) - 16, Math.round(scy) - 20, 33, 41);
          let rs = 0, gs = 0, bs = 0, cnt = 0, red = 0;
          for (let k = 0; k < im.data.length; k += 4) {
            rs += im.data[k]; gs += im.data[k + 1]; bs += im.data[k + 2]; cnt++;
            if (im.data[k] > im.data[k + 2] + 30) red++;
          }
          px = { mean: [Math.round(rs / cnt), Math.round(gs / cnt), Math.round(bs / cnt)], redFrac: +(red / cnt).toFixed(2) };
        }
      }
    }
    return { tod: undefined, home: n.home, homeless: !!n.homeless, dead: !!n.dead, bound: !!n.bound,
      npcPos: [Math.round(n.x), Math.round(n.y)], vis, anchor, px,
      ltAnchor: anchor != null && r.lighting ? r.lighting.lightAt(n.home.x, anchor) : null };
  }, scene);
  await saveCanvasShot(page, `/tmp/flagnight6-t${String(tod).replace('.', '_')}.png`);
  console.log('TOD', tod, JSON.stringify(snap));
}
await browser.close();
