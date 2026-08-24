// 终版:注入用户地图(固定世界) → 存档点+边界竖井两现场 → 单跑内量 lightAt/乘光前后/截图
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const MAPDATA = JSON.parse(readFileSync('/tmp/mapdata.json', 'utf8'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
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

// 注入 + 竖井 + 采样函数(单 evaluate 内完成,保证同一世界)
const result = await page.evaluate(async (md) => {
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
  window.__pin = (tx, ty) => { pl.x = tx * 16 + 8 - pl.w / 2; pl.y = ty * 16 + 8 - pl.h / 2; pl.vx = 0; pl.vy = 0; };
  // 竖井:海滩边界深度
  const cy = Math.round((g.world.groundLevel + g.world.rockLevel) / 2 + 40);
  for (let y = cy - 14; y <= cy + 12; y++)
    for (let x = 338; x <= 344; x++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); st.liquid[st.idx(x, y)] = 0; }
  const TORCH = window.__swTileByKey?.('torch') ?? 4;
  for (const y of [cy - 12, cy - 6, cy, cy + 5, cy + 10]) st.setTileSilent(344, y, TORCH);
  g.chunks.invalidateAll?.();
  // 采样器:缝检测 + 三层像素
  window.__probe = () => {
    const R = g.renderer, cam = g.camera, L = g.lighting;
    const cv = R.canvas;
    const mk = () => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; return c; };
    const cPost = mk(); const ctxPost = cPost.getContext('2d', { willReadFrequently: true }); ctxPost.drawImage(cv, 0, 0);
    const cPre = mk(); const ctxPre = cPre.getContext('2d', { willReadFrequently: true }); ctxPre.drawImage(R.worldCanvas, 0, 0);
    const img = ctxPost.getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width;
    const lum = (x, y) => { const o = (y * W + x) * 4; return (img[o] + img[o + 1] + img[o + 2]) / 3; };
    // 缝检测(屏中心 ±160)
    const pcx = Math.round(W / 2);
    const strips = [];
    for (let sx = pcx - 160; sx <= pcx + 160; sx++) {
      let cnt = 0;
      for (let y = 200; y < 700; y += 2) {
        const l = lum(sx, y), la = lum(sx - 14, y), lb = lum(sx + 14, y);
        if (la > 30 && lb > 30 && l < 0.72 * Math.min(la, lb)) cnt++;
      }
      if (cnt > 60) strips.push(sx);
    }
    const merged = [];
    for (const s of strips) {
      const last = merged[merged.length - 1];
      if (last && s - last[1] <= 3) last[1] = s;
      else merged.push([s, s]);
    }
    const zoom = cam.zoom;
    const px = (cv2, sx, sy) => {
      const x = Math.max(0, Math.min(cv2.width - 1, Math.round(sx)));
      const y = Math.max(0, Math.min(cv2.height - 1, Math.round(sy)));
      return (cv2 === cPost ? img : ctxPre.getImageData(x, y, 1, 1).data);
    };
    return merged.map(([s0, s1]) => {
      const mid = (s0 + s1) / 2;
      const wx = cam.x + (mid - W / 2) / zoom;
      const tx = Math.floor(wx / 16);
      const tyC = Math.floor(cam.y / 16);
      const [sxC, syC] = cam.worldToScreen(tx * 16 + 8, tyC * 16 + 8);
      const pre = px(cPre, sxC, syC);
      return { sx: [s0, s1], tx, tile: st.type[st.idx(tx, tyC)], wall: st.wall[st.idx(tx, tyC)], cpuLight: L.lightAt(tx, tyC), preLight: [pre[0], pre[1], pre[2]] };
    });
  };
  return { cy, ws: g.world.groundLevel, rock: g.world.rockLevel, saveTile: [Math.floor(md.px / 16), Math.floor(md.py / 16)] };
}, MAPDATA);
console.log('ENV', JSON.stringify(result));

// 现场 1:存档点
await page.evaluate((t) => window.__pin(t[0], t[1]), result.saveTile);
for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 500)); await page.evaluate((t) => window.__pin(t[0], t[1]), result.saveTile); }
const r1 = await page.evaluate(() => window.__probe());
console.log('SAVE-STOP', JSON.stringify(r1));
await page.screenshot({ path: '/tmp/final-save.png' });

// 现场 2:边界竖井
await page.evaluate(() => window.__pin(341, Math.round((window.__swGame.world.groundLevel + window.__swGame.world.rockLevel) / 2 + 40)));
for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 500)); await page.evaluate(() => window.__pin(341, Math.round((window.__swGame.world.groundLevel + window.__swGame.world.rockLevel) / 2 + 40))); }
const r2 = await page.evaluate(() => window.__probe());
console.log('SHAFT-STOP', JSON.stringify(r2));
await page.screenshot({ path: '/tmp/final-shaft.png' });
await browser.close();
