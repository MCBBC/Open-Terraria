// 反查:烘焙实际画的帧 vs autoFrameAt 预测帧。对样例格渲染 16×16 在整张贴图内
// 搜索最小色差帧(全 col×row),同时报告 paint/coat/half/slope 与 SW 所用 same 谓词掩码。
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
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return JSON.stringify(m.parseWldToSave(buf).save);
}, wldB64);
await p.evaluate((t) => window.__swLoadJson(t), conv);
for (let i = 0; i < 150; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await sleep(4000);
await p.evaluate(() => { const g = window.__swGame; g.player.x = 3964 * 16; g.player.y = 468 * 16; g.player.vx = 0; g.player.vy = 0; });
await sleep(5000);
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { autoFrameAt } = await import('/src/render/VanillaTiler.ts');
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const sheetCache = {};
  const getSheetCtx = (sheet) => {
    if (!sheetCache[sheet]) {
      const img = g.chunks.autotiler.atlas.ensureVImage(`vanilla/Tiles_${sheet}.png`);
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const cc = c.getContext('2d', { willReadFrequently: true });
      cc.drawImage(img, 0, 0);
      sheetCache[sheet] = { cc, w: img.width, h: img.height };
    }
    return sheetCache[sheet];
  };
  const samples = [[3969, 468], [3969, 469], [3968, 471], [3969, 471], [3970, 468], [3969, 472], [3968, 472], [3966, 473]];
  const rows = [];
  for (const [x, y] of samples) {
    const i = st.idx(x, y);
    const t = st.type[i];
    const sheet = TILE_DEFS[t]?.vanilla?.sheet;
    const pred = autoFrameAt(st, x, y, t);
    const ch = g.chunks.get(Math.floor(x / 16), Math.floor(y / 16));
    const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
    const tctx = tcv.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(ch.tile, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256);
    const rend = tctx.getImageData((x - Math.floor(x / 16) * 16) * 16, (y - Math.floor(y / 16) * 16) * 16, 16, 16).data;
    const { cc } = getSheetCtx(sheet);
    const cols = Math.floor(cc.canvas.width / 18), rws = Math.floor(cc.canvas.height / 18);
    let best = null;
    for (let r = 0; r < rws; r++) for (let c = 0; c < cols; c++) {
      const f = cc.getImageData(c * 18, r * 18, 16, 16).data;
      let d = 0;
      for (let k = 0; k < 16 * 16 * 4; k += 4) {
        if (Math.abs(rend[k + 3] - f[k + 3]) > 40) { d += 8; continue; }
        if (rend[k + 3] > 40) d += (Math.abs(rend[k] - f[k]) + Math.abs(rend[k + 1] - f[k + 1]) + Math.abs(rend[k + 2] - f[k + 2]));
      }
      if (!best || d < best.d) best = { c, r, d };
    }
    const predData = cc.getImageData(pred.col * 18, pred.row * 18, 16, 16).data;
    let pd = 0;
    for (let k = 0; k < 16 * 16 * 4; k += 4) {
      if (Math.abs(rend[k + 3] - predData[k + 3]) > 40) { pd += 8; continue; }
      if (rend[k + 3] > 40) pd += (Math.abs(rend[k] - predData[k]) + Math.abs(rend[k + 1] - predData[k + 1]) + Math.abs(rend[k + 2] - predData[k + 2]));
    }
    rows.push({ x, y, type: t, sheet, predictedFrame: `${pred.col},${pred.row}`, predDiff: pd,
      bestMatchFrame: `${best.c},${best.r}`, bestDiff: best.d,
      paint: st.paint[i], coat: st.coat[i], half: st.half[i], slope: st.slope[i] });
  }
  return rows;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
