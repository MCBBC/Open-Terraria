// 用户存档精确复现:灌入地图 JSON 数据 → 找孤立暗列竖缝
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

const result = await page.evaluate(async (md) => {
  const g = window.__swGame, st = g.world.store;
  const n = md.w * md.h;
  // ---- RLE 解码(与 serialize.ts rleTiles/rlePairs 同构) ----
  const b64dec = (b64) => { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };
  const varint = (u8, pos) => { let r = 0, s = 0; while (true) { const b = u8[pos]; pos++; r |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; } return [r, pos]; };
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
  let run, t, a, b, v;   // hoisted for the destructuring-free style above
  const T = decTiles(md.tiles);
  st.type.set(T.out); st.frameX.set(T.fx); st.frameY.set(T.fy);
  st.wall.set(decPairs(md.walls));
  st.liquid.set(decPairs(md.liquid));
  g.chunks.invalidateAll?.();
  const pl = g.player;
  pl.x = md.px; pl.y = md.py - pl.h / 2; pl.vx = 0; pl.vy = 0;
  // 手持火把照明
  pl.inv.slots[pl.inv.selected] = { id: 8, stack: 1 };
  g.cb.onInventoryChanged?.();
  await new Promise((r) => setTimeout(r, 3000));
  // ---- 孤立暗列检测 ----
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
  const ctx2 = c2.getContext('2d');
  ctx2.drawImage(cv, 0, 0);
  const full = ctx2.getImageData(0, 0, cv.width, cv.height).data;
  const W = cv.width, H = cv.height;
  const bright = (x, y) => full[(y * W + x) * 4] + full[(y * W + x) * 4 + 1] + full[(y * W + x) * 4 + 2] > 45;
  const seams = [];
  for (let sx = 60; sx < W - 60; sx++) {
    let isolated = 0;
    for (let sy = 60; sy < H - 4; sy++) {
      if (!bright(sx, sy) && bright(sx - 24, sy) && bright(sx + 24, sy)) isolated++;
    }
    if (isolated > 25) seams.push({ sx, isolated });
  }
  const merged = [];
  for (const s of seams) {
    const last = merged[merged.length - 1];
    if (last && s.sx - last.sx <= 4) last.isolated = Math.max(last.isolated, s.isolated);
    else merged.push({ ...s });
  }
  const cam = g.camera;
  const outSeams = merged.map((s) => {
    const wx = cam.x + (s.sx - W / 2) / cam.zoom;
    return { ...s, tx: Math.floor(wx / 16) };
  });
  await page.screenshot;
  return { seamCount: outSeams.length, seams: outSeams.slice(0, 8), player: [Math.floor(pl.cx / 16), Math.floor(pl.cy / 16)] };
}, MAPDATA);
console.log(JSON.stringify(result));
await page.screenshot({ path: '/tmp/userworld.png' });
await browser.close();
