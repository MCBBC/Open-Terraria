// ★A/B:drawHouseBanners 仪表 wrapper 开/关 × 正午/黄昏 → 旗布矩形像素+alpha 取证
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
    for (let y = sy - 9; y <= sy + 3; y++) { const i = st.idx(x, y); st.setTile(x, y, 0, 0, 0); st.liquid[i] = 0; st.setWall(x, y, w2.has(4) ? w2.get(4) : 4); }
    st.setTile(x, sy - 9, wood, 0, 0); st.setTile(x, sy + 3, wood, 0, 0);
  }
  for (let y = sy - 8; y <= sy + 2; y++) { st.setTile(sx - 11, y, wood, 0, 0); st.setTile(sx + 11, y, wood, 0, 0); }
  g.player.x = sx * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = sx * 16; g.camera.y = sy * 16;
  return { sx, sy };
});
await spawnTownNPC(page, 'guide', { tx: scene.sx, ty: scene.sy + 2, home: { x: scene.sx, y: scene.sy + 2 } });

const runCase = async (label, wrap, tod) => {
  await page.evaluate((wrapOn) => {
    const r = window.__swGame.renderer, proto = Object.getPrototypeOf(r);
    if (window.__origDHB) { proto.drawHouseBanners = window.__origDHB; window.__origDHB = null; }
    if (wrapOn) {
      const orig = proto.drawHouseBanners;
      window.__origDHB = orig;
      proto.drawHouseBanners = function (...a) {
        const L = this.lighting;
        const origLA = L.lightAt.bind(L);
        L.lightAt = (x, y, ...rest) => origLA(x, y, ...rest);
        try { return orig.apply(this, a); } finally { L.lightAt = origLA; }
      };
    }
  }, wrap);
  await freezeClock(page, { tod });
  await new Promise((r) => setTimeout(r, 1100));
  const snap = await page.evaluate(async (sceneIn) => {
    const g = window.__swGame, r = g.renderer, cam = g.camera, st = g.world.store;
    const { findBannerAnchorY } = await import(`/src/world/Housing.ts?t=${Date.now()}`);
    const hx = sceneIn.sx, hy = sceneIn.sy + 2;
    const anchor = findBannerAnchorY(st, hx, hy);
    const bx = hx * 16 + 8, by = (anchor + 1) * 16 + 18;
    const [scx, scy] = cam.worldToScreen(bx, by);
    const grab = (cv) => {
      if (!cv || !cv.width) return null;
      const c2 = document.createElement('canvas');
      c2.width = cv.width; c2.height = cv.height;
      const ctx = c2.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(cv, 0, 0);
      return ctx.getImageData(Math.max(0, Math.round(scx) - 17), Math.max(0, Math.round(scy) - 23), 35, 47);
    };
    const stat = (im) => {
      if (!im) return null;
      let n = 0, w = 0, rs = 0, gs = 0, bs = 0, as = 0, minL = 999, maxL = -1;
      for (let k = 0; k < im.data.length; k += 4) {
        const R = im.data[k], G = im.data[k + 1], B = im.data[k + 2], A = im.data[k + 3];
        n++; rs += R; gs += G; bs += B; as += A;
        const L = (R + G + B) / 3;
        if (L < minL) minL = L; if (L > maxL) maxL = L;
        if (R >= 225 && G >= 225 && B >= 225) w++;
      }
      return { mean: [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)], meanA: Math.round(as / n), white: +(w / n).toFixed(3), lumRange: [Math.round(minL), Math.round(maxL)] };
    };
    const wc = r.canvas;
    const fc = r.glCanvasEl ?? r.swPipe?.canvas ?? null;
    return { anchor, screen: [Math.round(scx), Math.round(scy)],
      world: stat(grab(wc)), final: stat(grab(fc)),
      camY: Math.round(cam.y), npcX: Math.round(g.entities.npcs[0]?.x ?? -1) };
  }, scene);
  await saveCanvasShot(page, `/tmp/flagnight5-${label}.png`);
  console.log(label, JSON.stringify(snap));
};

await runCase('noon-nowrap', false, 0.5);
await runCase('noon-wrap', true, 0.5);
await runCase('dusk-nowrap', false, 0.6667);
await runCase('dusk-wrap', true, 0.6667);
await browser.close();
