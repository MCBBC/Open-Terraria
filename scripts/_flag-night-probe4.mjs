// ★白旗机制实证:四种锚点几何 × 昼夜 → ltSolid/ltAir/白度对拍(2026-10-05)
// A: 1 厚屋顶+火把   B: 2 厚屋顶+火把   C: 2 厚屋顶无火把   D: 两层房(锚=楼板,上房露天)
import { launchBrowser, openPage, bootstrap, createGame, godMode,
  freezeClock, saveCanvasShot, spawnTownNPC } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const OUT = process.env.FLAG_OUT || '/tmp/flagnight4';
const TODS = (process.env.FLAG_TODS || '0.5,0.68,0.72,0.75,0.78,0.8125,0.9,0.0,0.25,0.3')
  .split(',').map(Number);

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await godMode(page, true);

// 四个房间并排,各住一个 guide;房间 x 间隔 30
const scene = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS, WALL_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const s2 = new Map(), w2 = new Map();
  TILE_DEFS.forEach((d, i) => { if (d?.vanilla && !s2.has(d.vanilla.sheet)) s2.set(d.vanilla.sheet, i); });
  WALL_DEFS.forEach((d, i) => { if (d?.vanilla && !w2.has(d.vanilla.sheet)) w2.set(d.vanilla.sheet, i); });
  const wallWood = w2.has(4) ? w2.get(4) : 4;
  const wood = s2.get(30), torch = s2.get(4);
  const sx0 = Math.floor(g.player.cx / 16) - 50, sy = Math.floor(g.player.cy / 16);
  const rooms = [];
  const build = (ox, roofThick, torchOn, secondFloor) => {
    const lx = sx0 + ox;   // 房中心 x
    // 清空大区
    for (let x = lx - 12; x <= lx + 12; x++) for (let y = sy - 16; y <= sy + 3; y++) {
      const i = st.idx(x, y); st.setTile(x, y, 0, 0, 0); st.liquid[i] = 0; st.setWall(x, y, wallWood);
    }
    // 地板 sy+3,侧壁,顶=第二层顶 sy-13;二层楼板(sy-5 起 roofThick 厚)
    for (let x = lx - 10; x <= lx + 10; x++) {
      st.setTile(x, sy + 3, wood, 0, 0);
      for (let t = 0; t < roofThick; t++) st.setTile(x, sy - 5 - t, wood, 0, 0);   // 一层顶(=旗锚层)
      for (let t = 0; t < 2; t++) st.setTile(x, sy - 13 + t, wood, 0, 0);          // 二层顶(挡天光)
    }
    for (let y = sy - 12; y <= sy + 2; y++) { st.setTile(lx - 11, y, wood, 0, 0); st.setTile(lx + 11, y, wood, 0, 0); }
    for (let y = sy - 4; y <= sy + 2; y++) { st.setTile(lx - 11, y, wood, 0, 0); st.setTile(lx + 11, y, wood, 0, 0); }
    if (torchOn) { st.setTile(lx + 7, sy + 2, torch, 0, 0); st.setTile(lx - 7, sy + 2, torch, 0, 0); }
    // 二层敞口(两侧不留墙→露天)——D 的楼板上方无遮挡
    return lx;
  };
  const variants = [
    { key: 'A_1roof_torch', roofThick: 1, torch: true, second: false },
    { key: 'B_2roof_torch', roofThick: 2, torch: true, second: false },
    { key: 'C_2roof_dark', roofThick: 2, torch: false, second: false },
    { key: 'D_slab_open', roofThick: 1, torch: true, second: true },
  ];
  let ox = 0;
  for (const v of variants) {
    const lx = build(ox, v.roofThick, v.torch, v.second);
    v.cx = lx; v.anchorTop = v.second ? sy - 6 : sy - 5 - v.roofThick + 1;
    ox += 30;
  }
  g.player.x = (sx0 + 45) * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = (sx0 + 45) * 16; g.camera.y = sy * 16;
  return { sx0, sy, variants };
});
console.log('SCENE', JSON.stringify(scene));

// 每 variant 入住 guide(home=站格 sy+2,站格选房中央空格)
for (const v of scene.variants) {
  const r = await spawnTownNPC(page, 'guide', { tx: v.cx, ty: scene.sy + 2, home: { x: v.cx, y: scene.sy + 2 } });
  console.log('NPC', v.key, JSON.stringify(r));
}

await page.evaluate(() => {
  const r = window.__swGame.renderer, proto = Object.getPrototypeOf(r);
  const orig = proto.drawHouseBanners;
  window.__hb = [];
  proto.drawHouseBanners = function (...a) {
    const L = this.lighting;
    if (L) {
      const origLA = L.lightAt.bind(L);
      L.lightAt = (x, y, ...rest) => {
        const v = origLA(x, y, ...rest);
        if (window.__hb.length < 200) window.__hb.push([x, y, v[0], v[1], v[2]]);
        return v;
      };
      try { return orig.apply(this, a); } finally { L.lightAt = origLA; }
    }
    return orig.apply(this, a);
  };
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const tod of TODS) {
  await freezeClock(page, { tod });
  await sleep(1000);
  const snap = await page.evaluate((sceneIn) => {
    const g = window.__swGame, st = g.world.store, cam = g.camera, r = g.renderer;
    const la = (x, y) => (r.lighting ? r.lighting.lightAt(x, y) : [0, 0, 0]);
    const out = [];
    const cv = r.glCanvasEl ?? r.swPipe?.canvas ?? r.canvas;
    let img = null;
    if (cv && cv.width) {
      const c2 = document.createElement('canvas');
      c2.width = cv.width; c2.height = cv.height;
      const ctx = c2.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(cv, 0, 0);
      img = ctx.getImageData(0, 0, c2.width, c2.height);
    }
    for (const v of sceneIn.variants) {
      const hx = v.cx, hy = sceneIn.sy + 2;
      let cy = hy - 1;
      while (cy >= 10) { const i = st.idx(hx, cy); if (st.flags[i] && (st.slope[i] === 0 ? st.type[i] : st.type[i])) { const d = st.type[i]; if (d) break; } cy--; }
      // solidLike 简化:type!=0 且 active 即候选(木块)
      cy = hy - 1;
      while (cy >= 10) { const i = st.idx(hx, cy); if (st.flags[i] && st.type[i]) break; cy--; }
      const ltS = la(hx, cy), ltA = la(hx, cy + 1);
      let white = null, mean = null;
      if (img) {
        const bx = hx * 16 + 8, by = (cy + 1) * 16 + 18;
        const [scx, scy] = cam.worldToScreen(bx, by);
        const R = 16, step = 2;
        let n = 0, w = 0, rs = 0, gs = 0, bs = 0;
        for (let dy = -R; dy <= R; dy += step) for (let dx = -R; dx <= R; dx += step) {
          const x = Math.round(scx + dx), y = Math.round(scy + dy);
          if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
          const k = (y * img.width + x) * 4;
          n++; rs += img.data[k]; gs += img.data[k + 1]; bs += img.data[k + 2];
          if (img.data[k] >= 225 && img.data[k + 1] >= 225 && img.data[k + 2] >= 225) w++;
        }
        white = n ? +(w / n).toFixed(3) : null;
        mean = n ? [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)] : null;
      }
      out.push({ key: v.key, anchor: cy, ltS, ltA, white, mean });
    }
    return { hb: window.__hb.splice(0, 40), out };
  }, scene);
  await saveCanvasShot(page, `${OUT}/t${String(tod).replace('.', '_')}.png`);
  console.log('TOD', tod);
  for (const o of snap.out) console.log('  ', o.key, 'anchor', o.anchor, 'ltS', JSON.stringify(o.ltS), 'ltA', JSON.stringify(o.ltA), 'white', o.white, 'mean', JSON.stringify(o.mean));
}
if (errs.length) console.log('PAGEERRORS', errs.slice(0, 6));
await browser.close();
