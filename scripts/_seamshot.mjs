// 带层竖缝截图复现:注入用户地图 → 存档点+海滩边界多点停靠 → 相对对比度缝检测 → 整屏+缝位裁剪截图
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const MAPDATA = JSON.parse(readFileSync('/tmp/mapdata.json', 'utf8'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 250)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));

// ---- 注入用户地图 + 布置检测环境(一次) ----
const env = await page.evaluate(async (md) => {
  const g = window.__swGame, st = g.world.store;
  const n = md.w * md.h;
  const b64dec = (b64) => { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };
  const varint = (u8, pos) => { let r = 0, s = 0; while (true) { const b = u8[pos]; pos++; r |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; } return [r, pos]; };
  var run, t, a, b, v;
  const decTiles = (b64) => {
    const u8 = b64dec(b64);
    const out = new Uint16Array(n), fx = new Uint16Array(n), fy = new Uint16Array(n);
    let pos = 0, i = 0;
    while (i < n && pos < u8.length) {
      let rr = varint(u8, pos); run = rr[0]; pos = rr[1];
      let tt = varint(u8, pos); t = tt[0]; pos = tt[1]; run++;
      if (t !== 0) {
        let aa = varint(u8, pos); a = aa[0]; pos = aa[1];
        let bb = varint(u8, pos); b = bb[0]; pos = bb[1];
        for (let k = 0; k < run; k++) { fx[i + k] = a; fy[i + k] = b; }
      }
      for (let k = 0; k < run; k++) out[i + k] = t;
      i += run;
    }
    return { out, fx, fy };
  };
  const decPairs = (b64) => {
    const u8 = b64dec(b64); const out = new Uint16Array(n);
    let pos = 0, i = 0;
    while (i < n && pos < u8.length) {
      let rr = varint(u8, pos); run = rr[0]; pos = rr[1];
      let vv = varint(u8, pos); v = vv[0]; pos = vv[1]; run++;
      for (let k = 0; k < run; k++) out[i + k] = v;
      i += run;
    }
    return out;
  };
  const T = decTiles(md.tiles);
  st.type.set(T.out); st.frameX.set(T.fx); st.frameY.set(T.fy);
  st.wall.set(decPairs(md.walls));
  st.liquid.set(decPairs(md.liquid));
  g.chunks.invalidateAll?.();
  const pl = g.player;
  pl.inv.slots[pl.inv.selected] = { id: 8, stack: 1 };   // 手持火把照明
  g.cb.onInventoryChanged?.();
  window.__pin = (tx, ty) => { pl.x = tx * 16 + 8 - pl.w / 2; pl.y = ty * 16 + 8 - pl.h / 2; pl.vx = 0; pl.vy = 0; };
  // 海滩带边界深度(活世界值) + x=341 附近找无墙气袋
  const ws = g.world.groundLevel, rock = g.world.rockLevel;
  const boundaryY = (ws + rock) / 2 + 40;
  const pockets = [];
  for (let ty = Math.floor(boundaryY) - 26; ty <= Math.floor(boundaryY) + 26 && pockets.length < 400; ty++) {
    for (let tx = 320; tx <= 372; tx++) {
      const i = st.idx(tx, ty);
      if (st.type[i] === 0 && st.wall[i] === 0) pockets.push([tx, ty]);
    }
  }
  // 存档点附近同样找无墙气袋(用户报缝的第二现场)
  const p0x = Math.floor(md.px / 16), p0y = Math.floor(md.py / 16);
  const pockets2 = [];
  for (let ty = p0y - 20; ty <= p0y + 20 && pockets2.length < 400; ty++) {
    for (let tx = p0x - 24; tx <= p0x + 24; tx++) {
      const i = st.idx(tx, ty);
      if (st.type[i] === 0 && st.wall[i] === 0) pockets2.push([tx, ty]);
    }
  }
  // 相对对比度竖缝检测:列亮度显著低于两侧 ±12px,持续≥30 采样行
  window.__detectSeams = () => {
    const cv = g.renderer.canvas;
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    const ctx2 = c2.getContext('2d');
    ctx2.drawImage(cv, 0, 0);
    const img = ctx2.getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width;
    const lum = (x, y) => { const o = (y * W + x) * 4; return (img[o] + img[o + 1] + img[o + 2]) / 3; };
    const X0 = 80, X1 = 940, Y0 = 400, Y1 = 880;
    const hits = [];
    for (let sx = X0; sx <= X1; sx++) {
      let cnt = 0;
      for (let y = Y0; y < Y1; y += 2) {
        const l = lum(sx, y), la = lum(sx - 12, y), lb = lum(sx + 12, y);
        if (la > 28 && lb > 28 && l < 0.7 * Math.min(la, lb)) cnt++;
      }
      if (cnt > 30) hits.push({ sx, cnt });
    }
    const merged = [];
    for (const h of hits) {
      const last = merged[merged.length - 1];
      if (last && h.sx - last.sx <= 3) { last.cnt = Math.max(last.cnt, h.cnt); last.sx2 = h.sx; }
      else merged.push({ sx: h.sx, sx2: h.sx, cnt: h.cnt });
    }
    const cam = g.camera;
    return merged.map((m) => {
      const wx = cam.x + ((m.sx + m.sx2) / 2 - W / 2) / cam.zoom;
      const sy = cam.y - (Y0 + Y1) / 2 / cam.zoom;
      return { ...m, tx: Math.floor(wx / 16), ty: Math.floor(sy / 16) };
    });
  };
  return { ws, rock, boundaryY, pocketN: pockets.length, pocketSample: pockets.slice(0, 5), pocket2N: pockets2.length, pocket2Sample: pockets2.slice(0, 5), saveTile: [p0x, p0y] };
}, MAPDATA);
console.log('ENV', JSON.stringify(env));

// ---- 停靠点序列 ----
const stops = [];
if (env.pocket2N > 0) stops.push({ name: 'save', tx: env.pocket2Sample[0][0], ty: env.pocket2Sample[0][1] });
if (env.pocketN > 0) {
  stops.push({ name: 'boundary-above', tx: env.pocketSample[0][0], ty: env.pocketSample[0][1] });
  const below = env.pocketSample.filter(([x, y]) => y > env.boundaryY);
  if (below.length) stops.push({ name: 'boundary-below', tx: below[0][0], ty: below[0][1] });
}
const report = [];
for (const s of stops) {
  await page.evaluate(([tx, ty]) => { window.__pin(tx, ty); }, [s.tx, s.ty]);
  await new Promise((r) => setTimeout(r, 2200));   // 等烘焙+光照稳定
  await page.evaluate(([tx, ty]) => { window.__pin(tx, ty); }, [s.tx, s.ty]);
  const seams = await page.evaluate(() => window.__detectSeams());
  report.push({ stop: s.name, tile: [s.tx, s.ty], seamCount: seams.length, seams: seams.slice(0, 8) });
  await page.screenshot({ path: `/tmp/seam-${s.name}.png` });
  // 缝位裁剪(前 3 处,320×320 视口裁剪)
  for (let k = 0; k < Math.min(3, seams.length); k++) {
    const cx = Math.max(0, Math.min(1280 - 320, seams[k].sx - 160));
    await page.screenshot({ path: `/tmp/seam-${s.name}-${k}.png`, clip: { x: cx, y: 380, width: 320, height: 380 } });
  }
}
console.log('REPORT', JSON.stringify(report));
await browser.close();
