// 分帧对齐验收矩阵:对给定 (探针类型, 基座类型) 组合构造 5x5 基座+中心 1 探针格,
// 断言:中心格渲染 = 全表最小差帧、零透明洞(实心)、(可选)零边缘暗像素。
// 用法: PAIRS="7:1,63:1,40:53" OUT=/path.json SW_ORIGIN=... node tools/run-diag.mjs scripts/_blend-matrix-probe.mjs
//   PAIRS 语法 "probeSheet:baseSheet,..."(SW 内部 id 由 key 表按 sheet 反查;找不到 key 的 sheet 跳过)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const WLD = '/Users/vinlic/Downloads/FTW V2.wld';
const OUT = process.env.OUT ?? '/tmp/blend-matrix.json';
const PAIRS = process.env.PAIRS ?? '40:53,40:0,40:1,7:1,63:1,57:1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wldB64 = fs.readFileSync(WLD).toString('base64');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 1512, height: 862 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
const conv = await p.evaluate(async (b64) => {
  const m = await import('/src/wld/WldImport.ts');
  const bin = atob(b64); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return JSON.stringify(m.parseWldToSave(buf).save);
}, wldB64);
await p.evaluate((t) => window.__swLoadJson(t), conv);
for (let i = 0; i < 150; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await sleep(4000);
const pairs = PAIRS.split(',').map((s) => s.split(':').map(Number));
const out = await p.evaluate(async (pairs) => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const bySheet = {};
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const v = TILE_DEFS[i]?.vanilla;
    if (v && bySheet[v.sheet] === undefined) bySheet[v.sheet] = i;
  }
  const sheetCtx = {};
  const getSheet = (sheet) => {
    if (!sheetCtx[sheet]) {
      const img = g.chunks.autotiler.atlas.ensureVImage(`vanilla/Tiles_${sheet}.png`);
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      sheetCtx[sheet] = c.getContext('2d', { willReadFrequently: true });
      sheetCtx[sheet].drawImage(img, 0, 0);
    }
    return sheetCtx[sheet];
  };
  const results = [];
  const slot = 6; // 每组占 6x6 格,间距 2
  pairs.forEach(([probeSheet, baseSheet], gi) => {
    const PROBE = bySheet[probeSheet], BASE = bySheet[baseSheet];
    if (PROBE === undefined || BASE === undefined) { results.push({ probeSheet, baseSheet, err: 'no-def' }); return; }
    const cx = 4100 + (gi % 10) * slot, cy = 400 + Math.floor(gi / 10) * slot;
    for (let y = cy - 1; y <= cy + 5; y++) for (let x = cx - 1; x <= cx + 5; x++) st.setTile(x, y, 0, 0, 0);
    for (let y = cy; y <= cy + 4; y++) for (let x = cx; x <= cx + 4; x++) st.setTile(x, y, BASE, 0, 0);
    st.setTile(cx + 2, cy + 2, PROBE, 0, 0);
    results.push({ probeSheet, baseSheet, cx: cx + 2, cy: cy + 2 });
  });
  const dirty = new Set();
  for (let y = 398; y <= 470; y++) for (let x = 4098; x <= 4160; x++) dirty.add(Math.floor(x / 16) + ',' + Math.floor(y / 16));
  for (const k of dirty) { const [cx, cy] = k.split(',').map(Number); g.chunks.markDirty(cx, cy); }
  await new Promise((r) => setTimeout(r, 2000));
  const probeCell = (x, y, sheet) => {
    const ch = g.chunks.get(Math.floor(x / 16), Math.floor(y / 16));
    if (!ch?.tile) return { err: 'no-chunk' };
    const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
    const tctx = tcv.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(ch.tile, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256);
    const d = tctx.getImageData((x - Math.floor(x / 16) * 16) * 16, (y - Math.floor(y / 16) * 16) * 16, 16, 16).data;
    const cc = getSheet(sheet);
    const cols = Math.floor(cc.canvas.width / 18), rws = Math.floor(cc.canvas.height / 18);
    let best = null;
    for (let r = 0; r < rws; r++) for (let c = 0; c < cols; c++) {
      const f = cc.getImageData(c * 18, r * 18, 16, 16).data;
      let dd = 0;
      for (let k = 0; k < 16 * 16 * 4; k += 4) {
        if (Math.abs(d[k + 3] - f[k + 3]) > 40) { dd += 8; continue; }
        if (d[k + 3] > 40) dd += (Math.abs(d[k] - f[k]) + Math.abs(d[k + 1] - f[k + 1]) + Math.abs(d[k + 2] - f[k + 2]));
      }
      if (!best || dd < best.d) best = { c, r, d: dd };
    }
    let holes = 0, darkEdge = 0;
    for (let k = 0; k < 16; k++) for (const [px2, py2] of [[k, 0], [k, 15], [0, k], [15, k]]) {
      const i = (py2 * 16 + px2) * 4;
      if (d[i + 3] <= 40) holes++;
      else if (d[i] < 45 && d[i + 1] < 45 && d[i + 2] < 45) darkEdge++;
    }
    return { frame: `${best.c},${best.r}`, diff: best.d, holes, darkEdgePx: darkEdge };
  };
  return results.map((r) => (r.err ? r : { ...r, center: probeCell(r.cx, r.cy, r.probeSheet) }));
}, pairs);
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
