// SW-BJ11 2026-09-07 定谳探针 v6:实机渲染 vs 期望烘焙 蒙版差
//  高空纯天空背景 + 极端色(品红/纯红/纯蓝/纯绿)外观 → 实机精灵像素可按色域识别;
//  期望帧 = compositePaperDoll(当前行) ×zoom6 贴同一锚;红=实机缺 蓝=实机多。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = '/tmp/swbj11';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5210';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/swbj11-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(2000);
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((x) => /我已知晓|知道/.test(x.textContent || ''));
  if (b) b.click();
  const g = window.__swGame, p = g.player;
  p.appearance = { name: 'probe', hair: 1, skinVariant: 0,
    hairColor: { r: 255, g: 0, b: 255 }, skinColor: { r: 255, g: 0, b: 255 },
    eyeColor: { r: 0, g: 0, b: 0 }, shirtColor: { r: 255, g: 0, b: 0 },
    undershirtColor: { r: 128, g: 0, b: 0 }, pantsColor: { r: 0, g: 0, b: 255 },
    shoeColor: { r: 0, g: 255, b: 0 }, difficulty: 0 };
  g.camera.zoom = 8; g.camera.zoomTarget = 8;
  g.world.clock.timeOfDay = 0.5;   // 正午亮天空? 换 0.0 夜晚深蓝 — 用 0.5 再说
});

const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame, p = g.player;
  // 玩家放高空(头顶留白,脚下铺一排灰石墩防坠落)
  const wx = Math.floor(p.x / 16), wy = 80;
  for (let dx = -3; dx <= 3; dx++) {
    g.world.store.setTile(wx + dx, wy, 1, 0, 0);       // 灰石
    for (let dy2 = 1; dy2 <= 6; dy2++) g.world.store.setTile(wx + dx, wy + dy2, 1, 0, 0);
  }
  p.x = (wx + 0.5) * 16 - p.w / 2; p.y = (wy - 4) * 16;
  p.vx = 0; p.vy = 0; p.facing = 1;
  await sleep(1500);                        // 落地稳定
  p.vx = 0; p.vy = 0;
  await sleep(400);
  const m = await import('/src/player/PaperDoll.ts');
  // 当前行(取渲染同源复算)
  const rows = g.renderer.playerFrameRows(p, null, 0, p.ridingMount ? p.mount : null, p.ridingCart ? p.cart : null, 0);
  const opts = rows.body === rows.legs ? undefined : { rows };
  let doll = null;
  for (let k = 0; k < 12 && !doll; k++) { doll = m.compositePaperDoll(p.appearance, { head: null, body: null, legs: null }, opts); if (!doll) await sleep(350); }
  await sleep(600);
  doll = m.compositePaperDoll(p.appearance, { head: null, body: null, legs: null }, opts);
  if (!doll) return { err: 'doll null' };
  const Z = g.camera.zoom;
  // 锚:translate(p.cx - facing*2.5, p.y + p.h + stepRenderY) 后 drawImage(-20, -52)
  const [axs, ays] = g.camera.worldToScreen(p.cx - p.facing * 2.5, p.y + p.h + (p.stepRenderY || 0));
  const sx0 = Math.round(axs - 20 * Z), sy0 = Math.round(ays - 52 * Z);
  // 实机画布截取
  const r = g.renderer;
  const live = document.createElement('canvas');
  live.width = 40 * Z; live.height = 56 * Z;
  const lc = live.getContext('2d', { willReadFrequently: true });
  lc.drawImage(r.canvas, sx0, sy0, 40 * Z, 56 * Z, 0, 0, 40 * Z, 56 * Z);
  const ld = lc.getImageData(0, 0, live.width, live.height).data;
  // 期望帧
  const exp = document.createElement('canvas');
  exp.width = 40 * Z; exp.height = 56 * Z;
  const ec = exp.getContext('2d', { willReadFrequently: true });
  ec.imageSmoothingEnabled = false;
  const isFull = doll.height >= 20 * 56;
  ec.drawImage(doll, 0, (isFull ? rows.body : 0) * 56, 40, 56, 0, 0, 40 * Z, 56 * Z);
  const ed = ec.getImageData(0, 0, exp.width, exp.height).data;
  // 精灵像素识别:极端色(品红/纯红/纯蓝/纯绿/黑瞳)主导 → 满足 2 通道极端
  const isSpritePx = (r8, g8, b8) =>
    (r8 > 200 && g8 < 90 && b8 > 200)   // 品红(发/肤)
    || (r8 > 200 && g8 < 90 && b8 < 90)  // 红(衫)
    || (b8 > 200 && r8 < 90 && g8 < 90)  // 蓝(裤)
    || (g8 > 200 && r8 < 90 && b8 < 90); // 绿(鞋)
  let miss = 0, extra = 0; const missCells = [], extraCells = [];
  for (let y = 0; y < 56; y++) for (let x = 0; x < 40; x++) {
    // 取 sprite 网格中心像素(去 zoom 边缘)
    const px = x * Z + (Z >> 1), py = y * Z + (Z >> 1);
    const li = (py * live.width + px) * 4, ei = (py * exp.width + px) * 4;
    const liveIs = isSpritePx(ld[li], ld[li + 1], ld[li + 2]);
    const expIs = ed[ei + 3] > 24;
    if (expIs && !liveIs) { miss++; if (missCells.length < 500) missCells.push([x, y]); }
    else if (!expIs && liveIs) { extra++; if (extraCells.length < 500) extraCells.push([x, y]); }
  }
  return { rows, miss, extra, missCells, extraCells };
}).catch((e) => ({ err: String(e && e.stack || e).slice(0, 300) }));
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: OUT + '/live-diff.png' });
console.log('LIVE-DIFF-DONE');
await browser.close();
