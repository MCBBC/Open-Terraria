// ★BJ647-B v4：复刻 v1 出现条件（手动钉相机 n.cy-260 与游戏回写对抗 + 玩家 x=n.cx-60
// + pin 200ms）+ hook 记录差分 + 出现轮放大截图。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = needInput(join(DOWNLOADS, '十周年纪念种子(2).wld'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&beh=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1500));
const buf = readFileSync(WLD);
const b64 = buf.toString('base64');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await window.__swFlow.importWld(u8);
}, b64);
for (let i = 0; i < 150; i++) {
  const ready = await page.evaluate(() => {
    const g = window.__swGame;
    return !!(g?.world?.store?.type?.length > 1000000 && g.world.name === '十周年纪念种子'
      && g.entities?.npcs?.some((n) => n.npcKey === 'witch_doctor'));
  }).catch(() => false);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());

// v1 条件：白天化 + 玩家 x=n.cx-60 + pin 200ms
await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  g.world.clock.timeOfDay = 0.5;
  window.__bjAnchor = { x: n.cx, y: n.cy };
  g.player.x = n.cx - 60; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
  }, 200);
});
await new Promise((r) => setTimeout(r, 1200));

// hook（同 v3）
const setupHook = () => page.evaluate(() => {
  const g = window.__swGame;
  const mainCv = g.renderer.canvas ?? document.querySelector('canvas');
  window.__rec = { on: false, log: [] };
  if (window.__hooked) return;
  window.__hooked = true;
  const clip = { w: 400, h: 300 }; // 全屏宽域记（按世界区过滤后置）
  const FR = CanvasRenderingContext2D.prototype.fillRect;
  const DI = CanvasRenderingContext2D.prototype.drawImage;
  const shortStack = () => new Error().stack.split('\n').slice(2, 7).map((l) => l.trim().replace(/^at /, '').replace(/:\d+:\d+\)?$/, ''));
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
    if (window.__rec.on && this.canvas === mainCv && Math.abs(x) < 100000) {
      window.__rec.log.push({ op: 'fillRect', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), fill: String(this.fillStyle), ga: +this.globalAlpha.toFixed(3), gco: this.globalCompositeOperation, st: shortStack() });
    }
    return FR.call(this, x, y, w, h);
  };
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    if (window.__rec.on && this.canvas === mainCv) {
      let x = 0, y = 0, w = (img && img.width) || 0, h = (img && img.height) || 0;
      if (rest.length >= 4 && typeof rest[0] === 'number') { x = rest[0]; y = rest[1]; w = rest[2]; h = rest[3]; }
      else if (rest.length >= 2) { x = rest[0]; y = rest[1]; }
      window.__rec.log.push({ op: 'drawImage', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
        src: (img && (img.id || (typeof img.src === 'string' ? img.src.split('/').pop() : 'offscreen'))) || 'offscreen',
        ga: +this.globalAlpha.toFixed(3), gco: this.globalCompositeOperation, st: shortStack() });
    }
    return DI.call(this, img, ...rest);
  };
});
await setupHook();

// grab：每轮重钉相机（v1 关键条件）+ 返回 NPC 屏幕位
const grab = () => page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  g.camera.y = n.cy - 260;                       // ★v1 关键：手动钉相机与回写对抗
  const cam = g.camera, z = cam.zoom ?? 1;
  const cw = g.renderer.canvas.clientWidth ?? 1280, ch = g.renderer.canvas.clientHeight ?? 800;
  return { sx: (n.cx - cam.x) * z + cw / 2, sy: (n.cy - cam.y) * z + ch / 2, camX: cam.x, camY: cam.y };
});
// 暗块检测（箱区世界窗=NPC 左 5.7 格）：世界坐标→屏幕坐标换算在 Node 侧做
const darkProbe = () => page.evaluate(({ cx0, cy0 }) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const cam = g.camera, z = cam.zoom ?? 1;
  const cw = g.renderer.canvas.clientWidth ?? 1280, ch = g.renderer.canvas.clientHeight ?? 800;
  // 箱区世界盒 (3921.5..3924.5, 275..279.5) tile → px
  const wx0 = 3921 * 16, wy0 = 272 * 16, wx1 = 3924.5 * 16, wy1 = 275.5 * 16;
  const sx0 = Math.round((wx0 - cam.x) * z + cw / 2), sy0 = Math.round((wy0 - cam.y) * z + ch / 2);
  const sw = Math.round((wx1 - wx0) * z), sh = Math.round((wy1 - wy0) * z);
  if (sx0 < 0 || sy0 < 0 || sx0 + sw > cv.width / (window.devicePixelRatio || 1) * (window.devicePixelRatio || 1)) { /* 界外兜 */ }
  const o = document.createElement('canvas');
  o.width = sw; o.height = sh;
  o.getContext('2d').drawImage(cv, sx0, sy0, sw, sh, 0, 0, sw, sh);
  const d = o.getContext('2d').getImageData(0, 0, sw, sh).data;
  let dark = 0, tot = 0;
  for (let y = 0; y < sh; y += 2) for (let x = 0; x < sw; x += 2) {
    const i = (y * sw + x) * 4;
    tot++;
    if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60 && d[i + 3] > 200) dark++;
  }
  return { ratio: +(dark / tot).toFixed(4), sx0, sy0, sw, sh };
}, { cx0: 0, cy0: 0 });

await page.mouse.move(10, 10);
await new Promise((r) => setTimeout(r, 400));
const base = await darkProbe();
console.log('baseline(off):', JSON.stringify(base));
let hits = 0;
const recs = [];
for (let k = 0; k < 30; k++) {
  const p = await grab();
  await page.mouse.move(Math.round(p.sx), Math.round(p.sy));
  await new Promise((r) => setTimeout(r, 150));
  const on = await darkProbe();
  await page.mouse.move(10, 10);
  await new Promise((r) => setTimeout(r, 150));
  const off = await darkProbe();
  const hit = on.ratio > off.ratio + 0.08;
  if (hit) { hits++; recs.push({ k, onR: on.ratio, offR: off.ratio }); }
}
console.log('v4 hits:', hits, JSON.stringify(recs));
// 若有命中：出现轮抓 __rec 记录差分（hover on 时黑罩调用）
if (hits > 0) {
  await page.mouse.move(10, 10);
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { window.__rec.on = true; window.__rec.log = []; });
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { window.__rec.on = false; });
  const logOff = await page.evaluate(() => window.__rec.log.length);
  const p = await grab();
  await page.evaluate(() => { window.__rec.on = true; window.__rec.log = []; });
  await page.mouse.move(Math.round(p.sx), Math.round(p.sy));
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { window.__rec.on = false; });
  const logOn = await page.evaluate(() => window.__rec.log);
  console.log('rec off-frames:', logOff, 'on-frames:', logOn.length);
  // 黑罩候选：fillStyle 含 rgba(0,0,0 / globalAlpha<1 的 fillRect
  const dark = logOn.filter((e) => e.op === 'fillRect' && /rgba?\(\s*0+\s*,\s*0+\s*,\s*0+/.test(e.fill) || (e.op === 'fillRect' && e.ga < 1 && /#000|rgba?\(\s*0/.test(e.fill)));
  console.log('dark fills:', JSON.stringify(dark.slice(0, 12), null, 1));
}
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
