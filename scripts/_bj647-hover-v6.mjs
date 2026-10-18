// ★BJ647-B v6：智能光标显式开+hook 抓 HighlightMask drawImage（caller 栈直定位）。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = needInput(join(DOWNLOADS, '十周年纪念种子(2).wld'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
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
const b64 = readFileSync(WLD).toString('base64');
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
// options 全键 dump
const keys = await page.evaluate(() => {
  const g = window.__swGame;
  return { dataKeys: Object.keys(g.options?.data ?? {}).slice(0, 80), smart: g.options?.data?.smartCursor, wanted: g.smartCursor?.wanted };
});
console.log('options:', JSON.stringify(keys).slice(0, 1200));
// 显式开智能光标（多键名尝试）+读回
const smart = await page.evaluate(() => {
  const g = window.__swGame;
  const d = g.options?.data;
  if (!d) return 'no-options';
  for (const k of ['smartCursor', 'SmartCursor', 'useSmartCursor', 'smartCurser']) if (k in d) { d[k] = true; return { key: k, val: d[k] }; }
  // 找含 smart 的键
  const hit = Object.keys(d).filter((k) => /smart/i.test(k));
  for (const k of hit) d[k] = true;
  return { smartKeys: hit };
});
console.log('smart set:', JSON.stringify(smart));
await new Promise((r) => setTimeout(r, 300));
// hook：HighlightMask drawImage 专捕
await page.evaluate(() => {
  const g = window.__swGame;
  const mainCv = g.renderer.canvas ?? document.querySelector('canvas');
  window.__rec = { log: [] };
  if (window.__hooked) return;
  window.__hooked = true;
  const DI = CanvasRenderingContext2D.prototype.drawImage;
  const FR = CanvasRenderingContext2D.prototype.fillRect;
  const shortStack = () => new Error().stack.split('\n').slice(2, 7).map((l) => l.trim().replace(/^at /, '').replace(/:\d+:\d+\)?$/, ''));
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    if (this.canvas === mainCv && img && (img.id === 'hl' || (typeof img.width === 'number' && window.__rec.watch.has(img)))) {
      const x = rest.length >= 4 ? rest[0] : (rest[0] ?? 0), y = rest.length >= 4 ? rest[1] : (rest[1] ?? 0);
      window.__rec.log.push({ op: 'drawImage', x: Math.round(x), y: Math.round(y), w: rest.length >= 4 ? Math.round(rest[2]) : img.width, h: rest.length >= 4 ? Math.round(rest[3]) : img.height, src: img.id || 'scr', ga: +this.globalAlpha.toFixed(3), st: shortStack() });
    }
    return DI.call(this, img, ...rest);
  };
  const FR0 = FR;
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
    if (this.canvas === mainCv && w > 6 && h > 6 && w < 300 && h < 300) {
      const f = String(this.fillStyle);
      if (/rgba?\((\d+),\s*(\d+),\s*(\d+)/.test(f) || f.startsWith('#')) {
        window.__rec.log.push({ op: 'fillRect', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), fill: f, ga: +this.globalAlpha.toFixed(3), gco: this.globalCompositeOperation, st: shortStack() });
      }
    }
    return FR0.call(this, x, y, w, h);
  };
});
console.log('hook v6 installed');
// 场景：玩家贴巫医，鼠标 hover 巫医帧盒中心
await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  g.world.clock.timeOfDay = 0.5;
  window.__bjAnchor = { x: n.cx, y: n.cy };
  g.player.x = n.cx - 50; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
  }, 200);
  // watch 集：捕获 drawImage 的 scratch 画布（highlight scratch 无法按 id 识别——记全部小尺寸 drawImage 由栈区分）
  window.__rec.watch = new Set();
});
await new Promise((r) => setTimeout(r, 1200));
const pos = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const cam = g.camera, z = cam.zoom ?? 1;
  return { sx: Math.round((n.cx - cam.x) * z + 640), sy: Math.round((n.cy - cam.y) * z + 400), wanted: g.smartCursor?.wanted, npcDist: g.smartInteractNpcDist, tileWon: undefined };
});
console.log('pos:', JSON.stringify(pos));
await page.mouse.move(10, 10);
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => { window.__rec.log = []; });
await page.mouse.move(pos.sx, pos.sy);
await new Promise((r) => setTimeout(r, 600));
const rec = await page.evaluate(() => window.__rec.log);
console.log('hover records:', rec.length);
console.log(JSON.stringify(rec.slice(0, 40), null, 1));
const st2 = await page.evaluate(() => {
  const g = window.__swGame;
  return { npcDist: g.smartInteractNpcDist, npcId: g.smartInteractNpcId, wanted: g.smartCursor?.wanted, showing: g.smartCursor?.showing, smartX: g.smartCursor?.x, smartY: g.smartCursor?.y };
});
console.log('state:', JSON.stringify(st2));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
