// ★NPC房屋旗帜夜间白背景 定谳探针(2026-10-05)
// 场景:spawn 建 NPC 房(木墙+背景木墙+火把),内置候选装饰:
//   旗帜91 ×6 style / 高尔夫旗493 / 灯笼42 / 中式灯笼95 / 吊灯34 / 玻璃54 / 火把4
// 多时刻 freezeClock → 每装饰物 3×3 tile 窗口白像素占比普查 + 全画布白簇 bbox
// + 区域 tile 帧对拍(16:00 vs 8:00 等时段帧变化)。
import { launchBrowser, openPage, bootstrap, createGame, godMode,
  freezeClock, saveCanvasShot, worldToScreen } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const OUT = process.env.FLAG_OUT || '/tmp/flagnight';
const TODS = (process.env.FLAG_TODS || '0.3333,0.5,0.625,0.6667,0.7,0.75,0.8125,0.9,0.0,0.2,0.30,0.35')
  .split(',').map(Number);

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await godMode(page, true);

// ---------- 建房 + 候选装饰 ----------
const scene = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS, WALL_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const sheet2id = new Map(), wallSheet2id = new Map();
  TILE_DEFS.forEach((d, i) => { if (d?.vanilla && !sheet2id.has(d.vanilla.sheet)) sheet2id.set(d.vanilla.sheet, i); });
  WALL_DEFS.forEach((d, i) => { if (d?.vanilla && !wallSheet2id.has(d.vanilla.sheet)) wallSheet2id.set(d.vanilla.sheet, i); });
  const W = (s) => (wallSheet2id.has(s) ? wallSheet2id.get(s) : s); // 墙内部 id 兜底=vid
  const sx = Math.floor(g.player.cx / 16), sy = Math.floor(g.player.cy / 16);
  const wood = sheet2id.get(30);
  // 主体:顶 sy-9 底 sy+3,侧壁 sx±11
  for (let x = sx - 11; x <= sx + 11; x++) {
    for (let y = sy - 9; y <= sy + 3; y++) {
      const i = st.idx(x, y);
      st.setTile(x, y, 0, 0, 0); st.liquid[i] = 0;
      st.setWall(x, y, W(4));                       // 木背景墙
    }
    st.setTile(x, sy - 9, wood, 0, 0);              // 顶板
    st.setTile(x, sy + 3, wood, 0, 0);              // 地板
  }
  for (let y = sy - 8; y <= sy + 2; y++) {
    st.setTile(sx - 11, y, wood, 0, 0);
    st.setTile(sx + 11, y, wood, 0, 0);
  }
  // 装饰锚点表(旗帜/窗候选;sheet→内部 id)
  const deco = [];
  const put = (name, sheet, x, y, fx, fy, wT, hT) => {
    const id = sheet2id.get(sheet);
    if (id == null) { deco.push({ name, why: 'no-sheet:' + sheet }); return; }
    st.setTile(x, y, id, fx, fy);
    deco.push({ name, sheet, id, x, y, fx, fy, wT, hT });
  };
  for (let s = 0; s < 6; s++) put('banner91_s' + s, 91, sx - 9 + s, sy - 8, s * 18, 0, 1, 3); // 旗帜 1×3
  put('golfFlag493', 493, sx - 2, sy + 1, 0, 0, 1, 2);
  put('lantern42', 42, sx + 1, sy - 8, 0, 0, 1, 1);
  put('cnLantern95', 95, sx + 3, sy - 8, 0, 0, 1, 2);
  put('chandelier34', 34, sx + 5, sy - 8, 0, 0, 3, 3);
  put('glass54_a', 54, sx - 5, sy - 5, 0, 0, 1, 1);
  put('glass54_b', 54, sx - 5, sy - 4, 0, 0, 1, 1);
  put('glass54_c', 54, sx - 4, sy - 5, 0, 0, 1, 1);
  put('glass54_d', 54, sx - 4, sy - 4, 0, 0, 1, 1);
  put('torch4', 4, sx + 8, sy + 2, 0, 0, 1, 1);
  put('torch4b', 4, sx - 8, sy + 2, 0, 0, 1, 1);
  // 玩家置房中央
  g.player.x = sx * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = sx * 16; g.camera.y = sy * 16;
  return { sx, sy, deco, wood };
});
console.log('SCENE', JSON.stringify(scene));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
for (const tod of TODS) {
  await freezeClock(page, { tod });
  await sleep(900);   // 光照收敛+渲染稳态
  const snap = await page.evaluate((sceneIn) => {
    const g = window.__swGame, st = g.world.store, cam = g.camera;
    const r = g.renderer;
    const cv = r.glCanvasEl ?? r.swPipe?.canvas ?? r.canvas;
    if (!cv || !cv.width) return { why: 'no-canvas' };
    // ①装饰窗口白度普查
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, 0, 0);
    const img = ctx.getImageData(0, 0, c2.width, c2.height);
    const px = (sx0, sy0) => {
      const x = Math.round(sx0), y = Math.round(sy0);
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
      const k = (y * img.width + x) * 4;
      return [img.data[k], img.data[k + 1], img.data[k + 2]];
    };
    const winStat = (cx, cy, halfTiles) => {
      const [scx, scy] = cam.worldToScreen(cx * 16 + 8, cy * 16 + 8);
      const step = Math.max(1, Math.round(cam.zoom * 16 / 3));
      let n = 0, white = 0, bright = 0, rs = 0, gs = 0, bs = 0;
      const R = halfTiles * 16 * cam.zoom;
      for (let dy = -R; dy <= R; dy += step) for (let dx = -R; dx <= R; dx += step) {
        const p = px(scx + dx, scy + dy);
        if (!p) continue;
        n++; rs += p[0]; gs += p[1]; bs += p[2];
        if (p[0] >= 240 && p[1] >= 240 && p[2] >= 240) white++;
        if (p[0] >= 200 && p[1] >= 200 && p[2] >= 200) bright++;
      }
      return n ? { white: +(white / n).toFixed(3), bright: +(bright / n).toFixed(3),
        mean: [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)] } : null;
    };
    const decoStats = {};
    for (const d of sceneIn.deco) {
      if (d.id == null) continue;
      decoStats[d.name] = winStat(d.x, d.y + ((d.hT || 1) - 1) / 2, Math.max(1, (d.wT || 1) / 2 + 0.5));
    }
    // ②全画布白簇 bbox(≥244 连通栅格)
    const grid = [];
    const gw = Math.ceil(img.width / 8), gh = Math.ceil(img.height / 8);
    for (let i = 0; i < gw * gh; i++) grid.push(0);
    for (let y = 0; y < img.height; y += 4) {
      for (let x = 0; x < img.width; x += 4) {
        const k = (y * img.width + x) * 4;
        if (img.data[k] >= 244 && img.data[k + 1] >= 244 && img.data[k + 2] >= 244) {
          grid[Math.floor(y / 8) * gw + Math.floor(x / 8)] = 1;
        }
      }
    }
    const seen = new Uint8Array(gw * gh);
    const clusters = [];
    for (let s = 0; s < gw * gh; s++) {
      if (!grid[s] || seen[s]) continue;
      let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, cnt = 0;
      const stack = [s]; seen[s] = 1;
      while (stack.length) {
        const cur = stack.pop(); cnt++;
        const cx0 = cur % gw, cy0 = (cur / gw) | 0;
        if (cx0 < minX) minX = cx0; if (cx0 > maxX) maxX = cx0;
        if (cy0 < minY) minY = cy0; if (cy0 > maxY) maxY = cy0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx0 + dx, ny = cy0 + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (grid[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
        }
      }
      if (cnt > 12) clusters.push({ cnt, wTiles: +((maxX - minX + 1) * 8 / 4 / 16 / cam.zoom).toFixed(1),
        hTiles: +((maxY - minY + 1) * 8 / 4 / 16 / cam.zoom).toFixed(1),
        cScreen: [Math.round((minX + maxX) / 2 * 8), Math.round((minY + maxY) / 2 * 8)] });
    }
    clusters.sort((a, b) => b.cnt - a.cnt);
    // ③区域 tile 对拍快照(含帧)
    const tiles = [];
    const { sx, sy } = sceneIn;
    for (let y = sy - 10; y <= sy + 4; y++) for (let x = sx - 12; x <= sx + 12; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i]) tiles.push([x, y, st.type[i], st.frameX ? st.frameX[i] : 0, st.frameY ? st.frameY[i] : 0]);
      else if (st.wall[i] === 0 && y > sy - 9 && y < sy + 3 && x > sx - 11 && x < sx + 11) tiles.push([x, y, 'noWall']);
    }
    return { cvw: cv.width, cvh: cv.height, zoom: cam.zoom, decoStats, clusters: clusters.slice(0, 8), tiles };
  }, scene);
  if (snap.why) { console.log('TOD', tod, 'ERR', snap.why); continue; }
  // tile 差异摘要:帧非零表
  const framed = snap.tiles.filter((t) => typeof t[3] === 'number' && (t[3] || t[4]));
  await saveCanvasShot(page, `${OUT}/t${String(tod).replace('.', '_')}.png`);
  results.push({ tod, zoom: snap.zoom, decoStats: snap.decoStats, clusters: snap.clusters, framed });
  console.log('TOD', tod, 'zoom', snap.zoom, 'clusters', JSON.stringify(snap.clusters.slice(0, 4)));
}
console.log('=== DECO STATS ===');
for (const r of results) console.log(r.tod, JSON.stringify(r.decoStats));
console.log('=== FRAMED TILES @each ===');
for (const r of results) console.log(r.tod, JSON.stringify(r.framed));
if (errs.length) console.log('PAGEERRORS', errs.slice(0, 6));
await browser.close();
