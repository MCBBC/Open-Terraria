// ★长浸:黄昏 tod=0.7 定格 3 分钟,跟踪住房复核失败因 + 旗布矩形逐取样(抓白帧)
import { launchBrowser, openPage, bootstrap, createGame, godMode,
  freezeClock, saveCanvasShot, spawnTownNPC } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const TOD = Number(process.env.FLAG_TOD || 0.7);
const MS = Number(process.env.FLAG_MS || 180000);

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
  const wood = s2.get(30), torch = s2.get(4), table = s2.get(14), chair = s2.get(15), plat = s2.get(19);
  for (let x = sx - 11; x <= sx + 11; x++) {
    for (let y = sy - 9; y <= sy + 3; y++) { const i = st.idx(x, y); st.setTile(x, y, 0, 0, 0); st.liquid[i] = 0; st.setWall(x, y, w2.has(4) ? w2.get(4) : 4); }
    st.setTile(x, sy - 9, wood, 0, 0); st.setTile(x, sy + 3, wood, 0, 0);
  }
  for (let y = sy - 8; y <= sy + 2; y++) { st.setTile(sx - 11, y, wood, 0, 0); st.setTile(sx + 11, y, wood, 0, 0); }
  // 桌 3×1(类型面足够) 椅 火把 平台
  st.setTile(sx - 6, sy + 2, table, 0, 0); st.setTile(sx - 5, sy + 2, table, 18, 0); st.setTile(sx - 4, sy + 2, table, 36, 0);
  st.setTile(sx - 6, sy + 1, chair, 0, 0);
  st.setTile(sx + 7, sy + 2, torch, 0, 0);
  st.setTile(sx + 9, sy + 3, plat, 0, 0); st.setTile(sx + 9, sy + 2, 0, 0, 0);
  g.player.x = sx * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = sx * 16; g.camera.y = sy * 16;
  return { sx, sy };
});
await spawnTownNPC(page, 'guide', { tx: scene.sx, ty: scene.sy + 2, home: { x: scene.sx, y: scene.sy + 2 } });

// 仪表:runQuickFindHome 失败因 + lightAt 记录
await page.evaluate(() => {
  const g = window.__swGame;
  const proto = Object.getPrototypeOf(g);
  const orig = proto.runQuickFindHome;
  window.__qfh = [];
  proto.runQuickFindHome = function (n, ax, ay) {
    const before = n.home ? [n.home.x, n.home.y] : null;
    const out = orig.apply(this, [n, ax, ay]);
    window.__qfh.push({ t: Date.now(), key: n.npcKey, anchor: [ax, ay], before, after: n.home ? [n.home.x, n.home.y] : null, ok: out });
    return out;
  };
});
await freezeClock(page, { tod: TOD });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
let i = 0;
while (Date.now() - t0 < MS) {
  await sleep(1500);
  i++;
  const s = await page.evaluate(async (sceneIn) => {
    const g = window.__swGame, r = g.renderer, cam = g.camera, st = g.world.store;
    const n = g.entities.npcs.find((x) => x.npcKey === 'guide');
    const { findBannerAnchorY } = await import(`/src/world/Housing.ts?t=${Date.now()}`);
    let px = null, lt = null;
    if (n?.home) {
      const anchor = findBannerAnchorY(st, n.home.x, n.home.y);
      if (anchor != null) {
        lt = r.lighting?.lightAt(n.home.x, anchor) ?? null;
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
    const qfhTail = window.__qfh.splice(0, 4);
    return { home: n?.home ? [n.home.x, n.home.y] : null, dead: !!n?.dead, lt, px, qfhTail };
  }, scene);
  console.log(i, JSON.stringify(s));
  if (s.px && s.px.white > 0.1) await saveCanvasShot(page, `/tmp/flagnight8-WHITE-${i}.png`);
}
await saveCanvasShot(page, `/tmp/flagnight8-final.png`);
await browser.close();
