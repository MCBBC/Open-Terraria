// IIII220 探针A：browser 实况物品图标(vicon 全真路) vs Steam 1458 xnbcli 真值。
//   SW_ORIGIN=http://localhost:5277 node tools/run-diag.mjs scripts/_iii220-icon.mjs
// 产物: /tmp/iii220-out/icon-report.json + icon-*.png(放大目检)
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5277';
const OUT = '/tmp/iii220-out';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.bringToFront();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (/error/i.test(t)) errs.push(t.slice(0, 160)); });
await page.goto(ORIGIN + '/?menu=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object', { timeout: 180000 });
await page.evaluate(() => { document.getElementById('sw-boot-prime')?.remove(); document.getElementById('sw-splash')?.remove(); });

// 药草族:种子(307-312,2357) + 材料(313-318,2358)
const IDS = [307, 308, 309, 310, 311, 312, 2357, 313, 314, 315, 316, 317, 318, 2358];

const crops = await page.evaluate(async (ids) => {
  const out = {};
  const { SpriteAtlas } = await import('/src/assets/SpriteAtlas.ts');
  const atlas = new SpriteAtlas();
  // vicon 全真路:ensureVImage 懒载(vimages 表,干净像素+预乘位图升格)
  for (const vid of ids) {
    atlas.vicon(vid);   // 首调触发懒载(必 null)
    // 懒载落地轮询(Image 升格 ImageBitmap 需时,首调必 null)
    let r2 = null;
    for (let i = 0; i < 100 && !r2; i++) { await new Promise((res) => setTimeout(res, 100)); r2 = atlas.vicon(vid); }
    if (!r2) { out[vid] = { err: 'vicon still null after 10s' }; continue; }
    const c = document.createElement('canvas');
    c.width = r2.sw; c.height = r2.sh;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    cx.drawImage(r2.img, r2.sx, r2.sy, r2.sw, r2.sh, 0, 0, r2.sw, r2.sh);
    const d = cx.getImageData(0, 0, r2.sw, r2.sh).data;
    let bin = '';
    for (let i = 0; i < d.length; i++) bin += String.fromCharCode(d[i]);
    out[vid] = { w: r2.sw, h: r2.sh, b64: btoa(bin) };
    // 放大目检件(4x 最近邻)
    const c4 = document.createElement('canvas');
    c4.width = r2.sw * 4; c4.height = r2.sh * 4;
    const cx4 = c4.getContext('2d');
    cx4.imageSmoothingEnabled = false;
    cx4.drawImage(r2.img, r2.sx, r2.sy, r2.sw, r2.sh, 0, 0, r2.sw * 4, r2.sh * 4);
    out['png_' + vid] = c4.toDataURL('image/png');
  }
  return out;
}, IDS);

// Node 侧对拍真值
const { PNG } = await import('/tmp/iii216-out/xnbcli/node_modules/pngjs/lib/png.js');
const { readFileSync } = await import('node:fs');
const report = { errs: [], rows: [] };
for (const vid of IDS) {
  const c = crops[vid];
  if (!c || c.err) { report.rows.push({ vid, err: c?.err ?? 'missing' }); continue; }
  let truth;
  try { truth = PNG.sync.read(readFileSync('/tmp/iii220-out/unpacked/Item_' + vid + '.png')); }
  catch { report.rows.push({ vid, err: 'no truth file' }); continue; }
  const got = Buffer.from(c.b64, 'base64');
  const row = { vid, dims: `${c.w}x${c.h}`, truthDims: `${truth.width}x${truth.height}` };
  if (c.w !== truth.width || c.h !== truth.height) row.verdict = 'DIM-DIFF';
  else {
    let diff = 0, first = null;
    for (let i = 0; i < got.length && i < truth.data.length; i++) {
      if (got[i] !== truth.data[i]) { diff++; if (!first) first = Math.floor(i / 4); }
    }
    row.diffBytes = diff; row.firstDiffPx = first;
    row.verdict = diff === 0 ? 'PIXEL-IDENTICAL' : 'DIFF';
  }
  report.rows.push(row);
  // 目检件落盘
  const png = Buffer.from(crops['png_' + vid].split(',')[1], 'base64');
  writeFileSync(`${OUT}/icon-${vid}.png`, png);
}
report.errs = errs.slice(0, 8);
writeFileSync(`${OUT}/icon-report.json`, JSON.stringify(report, null, 2));
console.log('SUMMARY', JSON.stringify(report.rows));
await browser.close();
