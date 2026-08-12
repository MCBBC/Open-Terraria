// 泥土黑色回归探针：主画面 canvas + 小地图 canvas 同一泥土格像素 RGB
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
p.on('console', m => { const t = m.text(); if (t.includes('ERR') || t.includes('warn')) console.log('CON:', t.slice(0, 200)); });
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid && window.__swGame.renderer?.minimap, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const res = { dirtId: -1, samples: [] };

  // 找 dirt 的内部 tile id 与玩家附近一块活性泥土
  let dirtId = -1;
  for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.key === 'dirt') { dirtId = i; break; }
  res.dirtId = dirtId;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  let hit = null;
  outer:
  for (let r = 4; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = px + dx, y = py + dy;
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === dirtId) { hit = { x, y }; break outer; }
      }
    }
  }
  res.hit = hit;
  if (!hit) return res;

  // 小地图像素
  const mm = g.renderer.minimap.canvas.getContext('2d');
  const mmImg = mm.getImageData(hit.x, hit.y, 1, 1).data;
  res.minimapRGB = [mmImg[0], mmImg[1], mmImg[2], mmImg[3]];
  res.colorFor = g.renderer.minimap.colorFor(hit.x, hit.y);
  res.lutTilesLen = g.renderer.minimap._mapLUT ? g.renderer.minimap._mapLUT.tiles.length : -1;
  if (g.renderer.minimap._mapLUT) {
    const v = g.renderer.minimap._mapLUT.tiles[dirtId];
    res.lutDirtWord = v;
    res.lutDirtHex = '#' + (v & 0xffffff).toString(16).padStart(6, '0');
  }

  // 主画面像素：世界坐标 → 屏幕（Camera.toScreen）
  const cam = g.camera;
  const wx = hit.x * 16 + 8, wy = hit.y * 16 + 8;
  const [sx, sy] = cam.toScreen(wx, wy);
  const cnv = g.renderer.canvas;
  const c2 = cnv.getContext('2d');
  const W = cnv.width, H = cnv.height;
  res.canvasSize = [W, H];
  res.screenPos = [Math.round(sx), Math.round(sy)];
  if (sx >= 0 && sy >= 0 && sx < W && sy < H) {
    const img = c2.getImageData(Math.max(0, Math.round(sx) - 8), Math.max(0, Math.round(sy) - 8), 17, 17).data;
    // 中心 3x3 平均 + 收集
    const cx0 = 8, cy0 = 8;
    let r = 0, gg = 0, bb = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const o = ((cy0 + dy) * 17 + cx0 + dx) * 4;
      r += img[o]; gg += img[o + 1]; bb += img[o + 2]; n++;
    }
    res.mainRGB = [Math.round(r / n), Math.round(gg / n), Math.round(bb / n)];
    res.mainCenterRGB = [img[(cy0 * 17 + cx0) * 4], img[(cy0 * 17 + cx0) * 4 + 1], img[(cy0 * 17 + cx0) * 4 + 2]];
  } else {
    // 不在屏内：把相机对准该格再采
    cam.x = wx; cam.y = wy;
    await new Promise(r2 => requestAnimationFrame(() => requestAnimationFrame(r2)));
    const [sx2, sy2] = cam.toScreen(wx, wy);
    res.screenPos = [Math.round(sx2), Math.round(sy2)];
    const img = c2.getImageData(Math.max(0, Math.round(sx2) - 2), Math.max(0, Math.round(sy2) - 2), 5, 5).data;
    res.mainCenterRGB = [img[52], img[53], img[54]];
    res.mainRGB = res.mainCenterRGB;
  }

  // 光照层在同一格的值（若黑是光照导致，这里会接近 0）
  const lc = g.renderer.lightCanvas;
  if (lc) {
    const lctx = lc.getContext('2d');
    const li = lctx.getImageData(Math.max(0, Math.round(sx) - 1), Math.max(0, Math.round(sy) - 1), 3, 3).data;
    let r3 = 0, g3 = 0, b3 = 0, n3 = 0;
    for (let o = 0; o < li.length; o += 4) { r3 += li[o]; g3 += li[o + 1]; b3 += li[o + 2]; n3++; }
    res.lightRGB = [Math.round(r3 / n3), Math.round(g3 / n3), Math.round(b3 / n3)];
  }
  res.dayFactor = g.world.clock?.dayFactor ?? -1;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
process.exit(0);
