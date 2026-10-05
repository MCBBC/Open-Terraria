// ★聚焦:旗布画在哪张画布/为何最终面无像素(2026-10-05)
import { launchBrowser, openPage, bootstrap, createGame, godMode,
  freezeClock, saveCanvasShot, spawnTownNPC } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
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
    for (let y = sy - 9; y <= sy + 3; y++) {
      const i = st.idx(x, y);
      st.setTile(x, y, 0, 0, 0); st.liquid[i] = 0;
      st.setWall(x, y, w2.has(4) ? w2.get(4) : 4);
    }
    st.setTile(x, sy - 9, wood, 0, 0);
    st.setTile(x, sy + 3, wood, 0, 0);
  }
  for (let y = sy - 8; y <= sy + 2; y++) { st.setTile(sx - 11, y, wood, 0, 0); st.setTile(sx + 11, y, wood, 0, 0); }
  st.setTile(sx + 7, sy + 2, s2.get(4), 0, 0);
  g.player.x = sx * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = sx * 16; g.camera.y = sy * 16;
  return { sx, sy };
});
await spawnTownNPC(page, 'guide', { tx: scene.sx, ty: scene.sy + 2, home: { x: scene.sx, y: scene.sy + 2 } });
await freezeClock(page, { tod: 0.5 });
await new Promise((r) => setTimeout(r, 1200));

const snap = await page.evaluate(async (sceneIn) => {
  const g = window.__swGame, r = g.renderer, cam = g.camera;
  const { findBannerAnchorY } = await import(`/src/world/Housing.ts?t=${Date.now()}`);
  const hx = sceneIn.sx, hy = sceneIn.sy + 2;
  const anchor = findBannerAnchorY(g.world.store, hx, hy);
  const bx = hx * 16 + 8, by = (anchor + 1) * 16 + 18;
  const [scx, scy] = cam.worldToScreen(bx, by);
  // 命中自检
  const hit = r.houseBannerNpcAt(bx, by, g.entities.npcs, g.world);
  // 贴图源自检
  const cloth = r.atlas?.vmisc ? r.atlas.vmisc('vanilla-ui/UI_House_Banner.png') : null;
  const clothInfo = cloth ? { sw: cloth.sw, sh: cloth.sh, sx: cloth.sx, sy: cloth.sy, src: cloth.img?.src?.slice?.(0, 80) ?? '(bitmap)' } : null;
  // 各画布采样
  const sample = (cv) => {
    if (!cv || !cv.width) return null;
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, 0, 0);
    const img = ctx.getImageData(0, 0, c2.width, c2.height);
    const k = (Math.round(scy) * img.width + Math.round(scx)) * 4;
    const k2 = ((Math.round(scy) + 8) * img.width + Math.round(scx)) * 4;
    return { w: cv.width, h: cv.height, id: cv.id || cv.className || '?', px: [img.data[k], img.data[k + 1], img.data[k + 2], img.data[k + 3]],
      pxBelow: [img.data[k2], img.data[k2 + 1], img.data[k2 + 2], img.data[k2 + 3]] };
  };
  const canvases = [];
  for (const cv of document.querySelectorAll('canvas')) canvases.push(sample(cv));
  return { anchor, bx, by, screen: [scx, scy], hit: hit ? hit.npcKey : null, clothInfo,
    zoom: cam.zoom, camX: cam.x, camY: cam.y,
    rCanvas: r.canvas ? { id: r.canvas.id, w: r.canvas.width } : null,
    glCanvasEl: r.glCanvasEl ? { id: r.glCanvasEl.id, w: r.glCanvasEl.width } : null,
    swPipe: r.swPipe ? { canvasId: r.swPipe.canvas?.id } : null,
    canvases };
}, scene);
console.log(JSON.stringify(snap, null, 1));
await saveCanvasShot(page, '/tmp/flagnight3-midday.png');
await browser.close();
