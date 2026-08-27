// 构造实验:石头被粘土/泥土/沙全包围时的选帧与边缘暗像素;对照石-气洞穴边。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const WLD = '/Users/vinlic/Downloads/FTW V2.wld';
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
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const STONE = TILE_BY_KEY['stone'], CLAY = TILE_BY_KEY['clay'], DIRT = TILE_BY_KEY['dirt'], SAND = TILE_BY_KEY['sand'];
  const X0 = 4200, Y0 = 400;
  for (let y = Y0 - 3; y <= Y0 + 16; y++) for (let x = X0 - 3; x <= X0 + 16; x++) st.setTile(x, y, 0, 0, 0);
  // 图案A: 3x3 粘土中央 1 石头(石头全包围) at (X0+2,Y0+2)
  for (let y = Y0 + 1; y <= Y0 + 3; y++) for (let x = X0 + 1; x <= X0 + 3; x++) st.setTile(x, y, CLAY, 0, 0);
  st.setTile(X0 + 2, Y0 + 2, STONE, 0, 0);
  // 图案B: 3x3 泥土中央 1 石头 at (X0+7,Y0+2)
  for (let y = Y0 + 1; y <= Y0 + 3; y++) for (let x = X0 + 6; x <= X0 + 8; x++) st.setTile(x, y, DIRT, 0, 0);
  st.setTile(X0 + 7, Y0 + 2, STONE, 0, 0);
  // 图案C: 3x3 沙中央 1 粘土 at (X0+12,Y0+2)
  for (let y = Y0 + 1; y <= Y0 + 3; y++) for (let x = X0 + 11; x <= X0 + 13; x++) st.setTile(x, y, SAND, 0, 0);
  st.setTile(X0 + 12, Y0 + 2, CLAY, 0, 0);
  const dirty = new Set();
  for (let y = Y0 - 3; y <= Y0 + 16; y++) for (let x = X0 - 3; x <= X0 + 16; x++) dirty.add(Math.floor(x / 16) + ',' + Math.floor(y / 16));
  for (const k of dirty) { const [cx, cy] = k.split(',').map(Number); g.chunks.markDirty(cx, cy); }
  await new Promise((r) => setTimeout(r, 1500));
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
  const probe = (x, y, sheet) => {
    const ch = g.chunks.get(Math.floor(x / 16), Math.floor(y / 16));
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
    let darkEdge = 0;
    for (let k = 0; k < 16; k++) for (const [px2, py2] of [[k, 0], [k, 15], [0, k], [15, k]]) {
      const i = (py2 * 16 + px2) * 4;
      if (d[i + 3] > 40 && d[i] < 45 && d[i + 1] < 45 && d[i + 2] < 45) darkEdge++;
    }
    return { frame: `${best.c},${best.r}`, diff: best.d, darkEdgePx: darkEdge };
  };
  return {
    stoneInClay: probe(X0 + 2, Y0 + 2, 1),
    stoneInDirt: probe(X0 + 7, Y0 + 2, 1),
    clayInSand: probe(X0 + 12, Y0 + 2, 40),
  };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
