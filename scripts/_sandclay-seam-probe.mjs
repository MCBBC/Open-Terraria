// 沙/粘土地下交界接缝取证探针（2026-08-27 用户标注 marks-FTW_V2 (3).json，31 格 sand↔clay/dirt 台阶）。
// 采集（烘焙 chunk 层原像素,与光照无关）：
//   A 区域烘焙实况 PNG（4x 放大存盘目检）
//   B 逐格:SW 选帧 autoFrameAt(col,row) + 渲染 16×16 vs 贴图帧逐像素差异数
//   C 渲染图 alpha 空洞普查:实心格内部透明像素坐标（透黑背景=可见缝的直接证据）
//   D 掩码/连通判定:每格 8 向 same-type 邻居实况
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const WLD = needInput(join(DOWNLOADS, 'FTW V2.wld'));
const OUT = process.env.OUT ?? '/tmp/sandclay-seam';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wldB64 = fs.readFileSync(WLD).toString('base64');

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'], defaultViewport: { width: 1512, height: 862 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(ORIGIN + '/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.evaluate(() => { (window).__lastErr = null; window.addEventListener('error', (ev) => { (window).__lastErr = String(ev.error?.stack ?? ev.message); }); });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 120000 });
const conv = await p.evaluate(async (b64) => {
  const m = await import('/src/wld/WldImport.ts');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return JSON.stringify(m.parseWldToSave(buf).save);
}, wldB64);
await p.evaluate((t) => window.__swLoadJson(t), conv);
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  await sleep(1000);
  inGame = await p.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swGame.player));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await sleep(4000);
await p.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 3964 * 16; g.player.y = 468 * 16;
  g.player.vx = 0; g.player.vy = 0;
});
await sleep(5000);

p.on('pageerror', (e) => { const st = String(e.stack ?? e); if (st.includes('RangeError')) { const fs2 = st.split('\n').filter((l) => l.includes('.ts:')).slice(0, 26).join('\n'); fs.writeFileSync('/tmp/vf-overflow-stack.txt', fs2); } });
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { autoFrameAt } = await import('/src/render/VanillaTiler.ts');
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const X0 = 3952, X1 = 3972, Y0 = 468, Y1 = 482; // 含全部标注±余量

  // 区域烘焙实况 → PNG(4x)
  const W = (X1 - X0 + 1) * 16, H = (Y1 - Y0 + 1) * 16;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = false;
  for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) {
    const chx = Math.floor(tx / 16), chy = Math.floor(ty / 16);
    const ch = g.chunks.get(chx, chy);
    if (!ch || !ch.tile) continue;
    cx.drawImage(ch.tile, ch.sx + (tx - chx * 16) * 16, ch.sy + (ty - chy * 16) * 16, 16, 16,
      (tx - X0) * 16, (ty - Y0) * 16, 16, 16);
  }
  const png4x = (() => {
    const z = document.createElement('canvas'); z.width = W * 4; z.height = H * 4;
    const zc = z.getContext('2d'); zc.imageSmoothingEnabled = false;
    zc.drawImage(cv, 0, 0, W * 4, H * 4);
    return z.toDataURL('image/png');
  })();

  // 逐标注格:选帧/渲染vs贴图差/空洞
  const typeOf = (x, y) => (st.inBounds(x, y) && st.flags[st.idx(x, y)]) ? st.type[st.idx(x, y)] : 0;
  const keyOf = (t) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  const sheetImg = {};
  const getSheet = (sheet) => {
    if (!sheetImg[sheet]) {
      const img = g.chunks.autotiler.atlas.ensureVImage(`vanilla/Tiles_${sheet}.png`);
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const cc = c.getContext('2d', { willReadFrequently: true });
      cc.drawImage(img, 0, 0);
      sheetImg[sheet] = cc;
    }
    return sheetImg[sheet];
  };
  const rows = [];
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const t = typeOf(x, y);
    if (t === 0) continue;
    const sheet = keyOf(t);
    if (sheet !== 53 && sheet !== 40 && sheet !== 0) continue; // 沙/粘土/泥土
    const f = autoFrameAt(st, x, y, t);
    const ch = g.chunks.get(Math.floor(x / 16), Math.floor(y / 16));
    if (!ch || !ch.tile) continue;
    const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
    const tctx = tcv.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(ch.tile, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256);
    const rend = tctx.getImageData((x - Math.floor(x / 16) * 16) * 16, (y - Math.floor(y / 16) * 16) * 16, 16, 16).data;
    const sc = getSheet(sheet).getImageData(f.col * 18, f.row * 18, 16, 16).data;
    let diff = 0, holes = [];
    for (let py = 0; py < 16; py++) for (let px2 = 0; px2 < 16; px2++) {
      const i = (py * 16 + px2) * 4;
      const ra = rend[i + 3], sa = sc[i + 3];
      if (Math.abs(ra - sa) > 40 || (ra > 40 && (Math.abs(rend[i] - sc[i]) > 12 || Math.abs(rend[i + 1] - sc[i + 1]) > 12 || Math.abs(rend[i + 2] - sc[i + 2]) > 12))) diff++;
      if (ra <= 40) holes.push(px2 + ',' + py);
    }
    // 8 向邻居实况
    const nb = { n: typeOf(x, y - 1), e: typeOf(x + 1, y), s: typeOf(x, y + 1), w: typeOf(x - 1, y) };
    rows.push({ x, y, type: t === typeOf(x, y) ? (sheet === 53 ? 'sand' : sheet === 40 ? 'clay' : 'dirt') : '?', frame: `${f.col},${f.row}`, diffPx: diff, holePx: holes.length, holes: holes.slice(0, 6), nb: Object.fromEntries(Object.entries(nb).map(([k, v]) => [k, v === 0 ? '.' : (keyOf(v) === 53 ? 'S' : keyOf(v) === 40 ? 'C' : keyOf(v) === 0 ? 'D' : 'o')])) });
  }
  return { png4x, rows, errStack: (window).__lastErr };
});
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(OUT + '/region4x.png', Buffer.from(out.png4x.split(',')[1], 'base64'));
fs.writeFileSync(OUT + '/rows.json', JSON.stringify(out.rows, null, 1));
const holes = out.rows.filter((r) => r.holePx > 0);
if (out.errStack) console.log('PAGE OVERFLOW STACK:\n' + out.errStack.split('\n').filter((l) => l.includes('.ts')).slice(0, 26).join('\n'));
console.log('solid tiles checked:', out.rows.length, ' with holes:', holes.length);
for (const h of holes.slice(0, 12)) console.log(`(${h.x},${h.y}) ${h.type} frame=${h.frame} holePx=${h.holePx} at ${h.holes.join(' ')} nb=${JSON.stringify(h.nb)}`);
const diffs = out.rows.filter((r) => r.diffPx > 0);
console.log('render!=sheet frames:', diffs.length);
for (const d of diffs.slice(0, 8)) console.log(`(${d.x},${d.y}) ${d.type} frame=${d.frame} diffPx=${d.diffPx}`);
console.log('region png →', OUT + '/region4x.png');
await b.close();
