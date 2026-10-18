// ★BJ647-B v3：黑矩形量化复现 + Canvas2D 绘制拦截（记录 clip 区内 fillRect/drawImage
// 调用+caller 栈），hover on/off 各抓一帧序列做记录差分——直接量到是哪笔画的黑罩。
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
const imported = await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  try { await window.__swFlow.importWld(u8); return { ok: true }; } catch (e) { return { ok: false, err: String(e) }; }
}, b64);
console.log('importWld:', JSON.stringify(imported));
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

// ---- 钉死一切：白天化、玩家贴巫医、巫医钉位 ----
const pos = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  g.world.clock.timeOfDay = 0.5;
  window.__bjAnchor = { x: n.cx, y: n.cy };
  g.player.x = n.cx - 40; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
  }, 150);
  return { cx: n.cx, cy: n.cy };
});
await new Promise((r) => setTimeout(r, 1200));
// 相机已随玩家稳定 → 读 NPC 屏幕位（dpr=2 时 renderer 逻辑分辨率仍 1280×800? 以 canvas CSS 尺寸为准）
const pos2 = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const cam = g.camera, z = cam.zoom ?? 1;
  const cw = g.renderer.canvas.clientWidth ?? 1280, ch = g.renderer.canvas.clientHeight ?? 800;
  return { sx: (n.cx - cam.x) * z + cw / 2, sy: (n.cy - cam.y) * z + ch / 2, dpr: window.devicePixelRatio, zoom: z, camX: cam.x, camY: cam.y };
});
console.log('npc screen:', JSON.stringify(pos2));
const mx = Math.round(pos2.sx), my = Math.round(pos2.sy);

// ---- 注入绘制拦截 hook（全 Canvas2D：记录与 clip 区相交的 fillRect/drawImage）----
const CLIP = { x: Math.max(0, mx - 140), y: Math.max(0, my - 110), w: 280, h: 220 };
await page.evaluate((clip) => {
  const g = window.__swGame;
  const mainCv = g.renderer.canvas ?? document.querySelector('canvas');
  window.__rec = { on: false, log: [] };
  const inClip = (x, y, w, h) => !(x + (w ?? 0) < clip.x || y + (h ?? 0) < clip.y || x > clip.x + clip.w || y > clip.y + clip.h);
  const FR = CanvasRenderingContext2D.prototype.fillRect;
  const DI = CanvasRenderingContext2D.prototype.drawImage;
  const SRC = CanvasRenderingContext2D.prototype.strokeRect;
  const shortStack = () => {
    const st = new Error().stack.split('\n').slice(2, 6).map((l) => l.trim().replace(/^at /, '').replace(/:\d+:\d+\)?$/, ''));
    return st;
  };
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
    if (window.__rec.on && this.canvas === mainCv && inClip(x, y, w, h)) {
      window.__rec.log.push({ op: 'fillRect', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
        fill: String(this.fillStyle), ga: +this.globalAlpha.toFixed(3), gco: this.globalCompositeOperation, st: shortStack() });
    }
    return FR.call(this, x, y, w, h);
  };
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    if (window.__rec.on && this.canvas === mainCv) {
      let x = 0, y = 0, w = 0, h = 0;
      if (rest.length >= 4 && typeof rest[0] === 'number') { x = rest[0]; y = rest[1]; w = rest[2]; h = rest[3]; }
      else if (rest.length >= 2) { x = rest[0]; y = rest[1]; w = rest.length > 2 ? (img.width ?? 0) : (img.width ?? 0); h = rest.length > 2 ? (img.height ?? 0) : (img.height ?? 0); w = img.width ?? 0; h = img.height ?? 0; }
      if (inClip(x, y, w, h)) {
        window.__rec.log.push({ op: 'drawImage', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
          src: (img && (img.__swSrc || (img.dataset && img.dataset.swSrc) || img.id || (typeof img.src === 'string' ? img.src.split('/').pop() : 'offscreen'))) ?? 'offscreen',
          ga: +this.globalAlpha.toFixed(3), gco: this.globalCompositeOperation, st: shortStack() });
      }
    }
    return DI.call(this, img, ...rest);
  };
  CanvasRenderingContext2D.prototype.strokeRect = function (x, y, w, h) {
    if (window.__rec.on && this.canvas === mainCv && inClip(x, y, w, h)) {
      window.__rec.log.push({ op: 'strokeRect', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
        stroke: String(this.strokeStyle), ga: +this.globalAlpha.toFixed(3), st: shortStack() });
    }
    return SRC.call(this, x, y, w, h);
  };
}, CLIP);
console.log('hook installed');

// ---- hover on/off 交替 40 轮量化 ----
const grabHasDarkBlock = () => page.evaluate((clip) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const o = document.createElement('canvas');
  o.width = clip.w; o.height = clip.h;
  o.getContext('2d').drawImage(cv, clip.x, clip.y, clip.w, clip.h, 0, 0, clip.w, clip.h);
  const d = o.getContext('2d').getImageData(0, 0, clip.w, clip.h).data;
  // 黑块特征：在箱区子窗（clip 内左 1/3、中 1/2 高）统计暗像素占比
  const sx = 0, sw = Math.floor(clip.w / 3), sy = 0, sh = clip.h;
  let dark = 0, tot = 0;
  for (let y = sy; y < sy + sh; y += 2) for (let x = sx; x < sx + sw; x += 2) {
    const i = (y * clip.w + x) * 4;
    tot++;
    if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60 && d[i + 3] > 200) dark++;
  }
  return { dark, tot, ratio: +(dark / tot).toFixed(4) };
}, CLIP);
// 基线：鼠标远端时的暗占比
await page.mouse.move(10, 10);
await new Promise((r) => setTimeout(r, 500));
const base = await grabHasDarkBlock();
console.log('baseline dark-ratio(off):', JSON.stringify(base));
let hits = 0;
const seq = [];
for (let k = 0; k < 40; k++) {
  await page.mouse.move(mx, my);
  await new Promise((r) => setTimeout(r, 120));
  const on = await grabHasDarkBlock();
  await page.mouse.move(10, 10);
  await new Promise((r) => setTimeout(r, 120));
  const off = await grabHasDarkBlock();
  const hit = on.ratio > base.ratio + 0.05;
  if (hit) hits++;
  seq.push({ k, onR: on.ratio, offR: off.ratio, hit });
}
console.log('hover-40 hits:', hits, JSON.stringify(seq.filter((s) => s.hit).slice(0, 10)));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
