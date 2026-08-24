// 岩石带竖缝复现:注入用户地图 → 深竖井(岩石带区,rockTP 下 ~40 格) → 截图
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

const info = await page.evaluate(async (md) => {
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
  // 深竖井:岩石带区(rockTP 下 ~40 格)
  const ws = g.world.groundLevel, rock = g.world.rockLevel;
  const rockSpan = (rock | 0) - (ws | 0);
  const rockSteps = Math.ceil(rockSpan * 16 / 96);
  const rockTP = (ws | 0) * 16 + rockSteps * 96 + 32;
  const cy = Math.floor(rockTP / 16) + 40;
  const TORCH = window.__swTileByKey?.('torch') ?? 4;
  const chamber = (cx0) => {
    for (let y = cy - 8; y <= cy + 8; y++)
      for (let x = cx0 - 15; x <= cx0 + 15; x++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); st.liquid[st.idx(x, y)] = 0; }
    for (const x of [cx0 - 13, cx0 - 6, cx0, cx0 + 7, cx0 + 13]) st.setTileSilent(x, cy + 8, TORCH);
  };
  window.__chamberAt = (cx0) => { chamber(cx0); g.chunks.invalidateAll?.(); };
  const pl = g.player;
  // ★复现用户条件:覆盖 rockLevel 让沙滩风格(oceanTop)下探到岩石带——
  //   用户世界 ws/rock 未知(地图导出无 header),其沙滩翻转线低于 rockTP,
  //   故其沙滩岩石带(BG_3,128 宽)可见且带缝
  g.world.rockLevel = 360;
  const cyB = 375;
  for (let y = cyB - 8; y <= cyB + 8; y++)
    for (let x = 326; x <= 356; x++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); st.liquid[st.idx(x, y)] = 0; }
  for (const x of [328, 334, 341, 348, 354]) st.setTileSilent(x, cyB + 8, TORCH);
  g.chunks.invalidateAll?.();
  window.__pinBeach = () => { pl.x = 341 * 16 + 8 - pl.w / 2; pl.y = cyB * 16 + 8 - pl.h / 2; pl.vx = 0; pl.vy = 0; };
  window.__pinBeach();
  chamber(1000);
  g.chunks.invalidateAll?.();
  window.__pinAt = (cx0) => { pl.x = cx0 * 16 + 8 - pl.w / 2; pl.y = cy * 16 + 8 - pl.h / 2; pl.vx = 0; pl.vy = 0; };
  window.__pinAt(1000);
  window.__detectSeams = () => {
    const cam = g.camera;
    const cv = g.renderer.canvas;
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    const ctx2 = c2.getContext('2d');
    ctx2.drawImage(cv, 0, 0);
    const img = ctx2.getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width;
    const lum = (x, y) => { const o = (y * W + x) * 4; return (img[o] + img[o + 1] + img[o + 2]) / 3; };
    const out = [];
    for (let sx = 100; sx < W - 100; sx++) {
      let cnt = 0;
      for (let y = 150; y < 750; y += 2) {
        const l = lum(sx, y), la = lum(sx - 20, y), lb = lum(sx + 20, y);
        if (la > 25 && lb > 25 && l < 0.6 * Math.min(la, lb)) cnt++;
      }
      if (cnt > 80) out.push(sx);
    }
    const merged = [];
    for (const s of out) {
      const last = merged[merged.length - 1];
      if (last && s - last[1] <= 4) last[1] = s;
      else merged.push([s, s]);
    }
    const zoom = cam.zoom;
    return merged.map(([a2, b2]) => {
      const wx = cam.x + ((a2 + b2) / 2 - W / 2) / zoom;
      return { sx: [a2, b2], tx: Math.floor(wx / 16) };
    });
  };
  return { cy, rockTP: Math.floor(rockTP / 16), ws, rock };
}, MAPDATA);
console.log('LOC', JSON.stringify(info));
const waitSettle = async (cx0) => {
  for (let i = 0; i < 7; i++) { await new Promise((r) => setTimeout(r, 500)); await page.evaluate((c) => window.__pinAt(c), cx0); }
  await page.evaluate((c) => window.__pinAt(c), cx0);
  await new Promise((r) => setTimeout(r, 400));
};
for (let i = 0; i < 7; i++) { await new Promise((r) => setTimeout(r, 500)); await page.evaluate(() => window.__pinBeach()); }
await page.evaluate(() => window.__pinBeach());
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/rockband-before.png' });
const seams1 = await page.evaluate(() => window.__detectSeams());
console.log('SEAMS-beach', JSON.stringify(seams1));
await page.evaluate(() => window.__chamberAt(1600));
await waitSettle(1600);
await page.screenshot({ path: '/tmp/rockband-before-1600.png' });
// 缝检测
const seams = await page.evaluate(() => window.__detectSeams?.() ?? []);
console.log('SEAMS', JSON.stringify(seams));
await browser.close();
await browser.close();
