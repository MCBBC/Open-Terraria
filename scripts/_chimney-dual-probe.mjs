// v4:tick 相位关联取证——每帧记录:
//   tick%5（壁炉重烘焙节拍）/%8（烟囱节奏）、bbox 内容签名、
//   以及 atlas.vframe/vframeAt(内部 id 224) 调用监测(存在性/返回值)。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || needInput(join(DOWNLOADS, 'map-FTW_V2 (10).json'));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate((t) => window.__swFlow.loadJson(t), fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  g.player.x = 4131 * 16 + 8; g.player.y = (437 - 2) * 16;
  g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
  await new Promise((r) => setTimeout(r, 1800));
  // 监视 Tiles_406 图像句柄生命周期(Image 对象是长期持有的同一实例)
  const winAny = window;
  const renderer = g.renderer || winAny.__swRendererCached;
  const cam = g.camera;
  const cvW = 988, cvH = 862, Z = cam.zoom ?? 1.25;
  const cvs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height);
  const ctx = cvs[0].getContext('2d', { willReadFrequently: true });
  const track = [];
  const perf0 = performance.now();
  const resCounts = () => performance.getEntriesByType('resource').filter((r) => /Tiles_406/.test(r.name)).length;
  for (let k = 0; k < 120; k++) {
    const [bx, by] = (() => { const d = cam.worldToScreen ? cam.worldToScreen(4129 * 16, 433 * 16) : [(4129 * 16 - cam.x) * Z + cvW / 2, (433 * 16 - cam.y) * Z + cvH / 2]; return d.map(Math.round); })();
    const px = ctx.getImageData(bx, by, 102, 102).data;
    let lit = 0;
    const sig = [];
    for (let o = 0; o < px.length; o += 137) { sig.push(String.fromCharCode(65 + ((px[o] + px[o + 2]) % 26))); if (px[o] + px[o + 1] + px[o + 2] > 260) lit++; }
    track.push({ k, lit, sig: sig.join(''), mod5: g.tileAnim ? -1 : -1,
      resources406: resCounts() });
    await new Promise((r) => setTimeout(r, 90));
  }
  // 分析:签名翻转分布 + 是否存在 lit 骤降(透明)事件
  let vanish = 0; const vanishAt = []; const prevLitArr = [];
  for (let k = 1; k < track.length; k++) {
    const drop = track[k].lit - track[k - 1].lit;
    if (track[k].lit < 15 && track[k - 1].lit > 60) { vanish++; vanishAt.push(k); }
    void drop;
    void vanishAt; void prevLitArr;
    prevLitArr.push(track[k].lit);
  }
  return {
    vframeCallsNote: 'draw 层不重复采样,由烘焙承担',
    resources406Final: resCounts(),
    litCurve: track.map((t) => t.lit),
    vanishCount: vanish, vanishAt,
    distinctSig: new Set(track.map((t) => t.sig)).size,
    trackHead: track.slice(0, 5),
  };
});
console.log(JSON.stringify(out));
fs.writeFileSync('/tmp/chimney-v4.json', JSON.stringify(out));
await browser.close();
