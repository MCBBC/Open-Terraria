// 宝箱视觉诊断：载入地图 → 相机对准一个宝箱 → 截图 → 按格分块像素方差
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = process.argv[2] || '/Users/vinlic/Downloads/map-可疑的螃蟹寺庙.json';
const json = fs.readFileSync(MAP, 'utf8');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__swFlow, { timeout: 60000 });
const out = await page.evaluate(async (text) => {
  await window.__swFlow.loadJson(text);
  const g = window.__swGame;
  await new Promise((r) => setTimeout(r, 2500));
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  // 找第一个宝箱（v_21 内部 chest 或 v_467）
  let spot = null;
  outer:
  for (const c of g.world.chests) {
    const t = st.type[st.idx(c.x, c.y)];
    if (t === 0) continue;
    spot = { x: c.x, y: c.y, t, fx: st.frameX[st.idx(c.x, c.y)], fy: st.frameY[st.idx(c.x, c.y)] };
    break outer;
  }
  const target = [];
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const xx = 1984 + dx, yy = 457 + dy;
    const ii = st.idx(xx, yy);
    target.push({ x: xx, y: yy, t: st.type[ii], fx: st.frameX[ii], fy: st.frameY[ii] });
  }
  void target;
  if (!spot) return { none: true, target };
  // 全图扫描每个宝箱实例的四格帧：找"四格同帧"异常实例
  const bad = [];
  const chestTileIds = new Set();
  for (let x = 0; x < st.w; x++) for (let y = 0; y < st.h; y++) {
    const i = st.idx(x, y);
    const t = st.type[i];
    if (t !== 0 && TILE_DEFS[t]?.key && (TILE_DEFS[t].key === 'chest' || TILE_DEFS[t].key.startsWith('v_46') || TILE_DEFS[t].key.includes('chest'))) chestTileIds.add(t);
  }
  for (let x = 0; x < st.w; x++) for (let y = 0; y < st.h; y++) {
    const i = st.idx(x, y);
    if (!chestTileIds.has(st.type[i])) continue;
    // 收集 2x2 邻域同型格
    const cells4 = [];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= st.w || yy >= st.h) { cells4.push(null); continue; }
      const ii = st.idx(xx, yy);
      cells4.push(st.type[ii] === st.type[i] ? { fx: st.frameX[ii], fy: st.frameY[ii] } : null);
    }
    if (cells4.every((c) => c && c.fx === cells4[0].fx && c.fy === cells4[0].fy)) {
      bad.push({ x, y, t: st.type[i], name: TILE_DEFS[st.type[i]]?.key, fx: cells4[0].fx, fy: cells4[0].fy });
      if (bad.length >= 8) break;
    }
  }
  void spot;
  // 相机对准（像素级精确）：直接设 camera 位置让宝箱落在屏幕中心
  const cam = g.camera;
  cam.x = spot.x * 16 + 8;
  cam.y = spot.y * 16 + 8;
  await new Promise((r) => setTimeout(r, 800));
  const cv = g.renderer.canvas;
  const c2 = cv.getContext('2d');
  const [sx, sy] = cam.worldToScreen(spot.x * 16, spot.y * 16);
  // 相机 follow 玩家会拉回——临时冻结：把玩家传送到宝箱旁
  g.player.x = spot.x * 16 - 24; g.player.y = spot.y * 16 - 24;
  await new Promise((r) => setTimeout(r, 1200));
  const [sx2, sy2] = cam.worldToScreen(spot.x * 16, spot.y * 16);
  // 4 格（2×2）各取像素签名
  const K = 4;
  const cells = [];
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const ox = Math.round(sx2 + dx * 16 * cam.zoom), oy = Math.round(sy2 + dy * 16 * cam.zoom);
    const d = c2.getImageData(ox, oy, 16 * cam.zoom, 16 * cam.zoom).data;
    const sig = [];
    for (let p = 0; p < d.length; p += K * 16) sig.push(d[p], d[p + 1], d[p + 2]);
    cells.push({ dx, dy, sigHash: sig.join(',').slice(0, 96), first: sig.slice(0, 6) });
  }
  return { spot, target, bad, chestTileIds: [...chestTileIds], cam: [Math.round(cam.x), Math.round(cam.y)], zoom: cam.zoom, screen: [Math.round(sx2), Math.round(sy2)], cells };
}, json);
console.log(JSON.stringify(out, null, 1));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/chest.png' });
await browser.close();
