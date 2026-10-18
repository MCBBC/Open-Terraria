// ★BJ647-B v7：强制智能光标 wanted=true + hover NPC + 按栈过滤 drawSmartInteractTileHighlights
// 绘制（HighlightMask 合成调用）——直抓暗高亮画在哪。
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
// 强制智能光标（每 100ms 写 wanted+VUI.smartCursorOn）
await page.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  window.__bjAnchor = { x: n.cx, y: n.cy };
  g.player.x = n.cx - 50; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
    g.smartCursor.wanted = true;
    const V = window.VUI ?? (window.__swGame?.vui);
    try { if (window.VUI) window.VUI.smartCursorOn = true; } catch {}
  }, 100);
  if (!window.__hooked) {
    window.__hooked = true;
    const mainCv = g.renderer.canvas ?? document.querySelector('canvas');
    window.__rec = { log: [] };
    const DI = CanvasRenderingContext2D.prototype.drawImage;
    const FR = CanvasRenderingContext2D.prototype.fillRect;
    const shortStack = () => new Error().stack.split('\n').slice(2, 6).map((l) => l.trim().replace(/^at /, '').replace(/:\d+:\d+\)?$/, ''));
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
      if (this.canvas === mainCv) {
        const st = shortStack();
        if (st.some((s) => /drawSmartInteractTileHighlights|drawHealthBar|drawMouseTextLayer|drawSmartCursor/.test(s))) {
          const x = rest.length >= 4 ? rest[0] : (rest[0] ?? 0), y = rest.length >= 4 ? rest[1] : (rest[1] ?? 0);
          window.__rec.log.push({ op: 'drawImage', x: Math.round(x), y: Math.round(y), w: rest.length >= 4 ? Math.round(rest[2]) : img.width, h: rest.length >= 4 ? Math.round(rest[3]) : img.height, st });
        }
      }
      return DI.call(this, img, ...rest);
    };
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas === mainCv) {
        const st = shortStack();
        if (st.some((s) => /drawSmartInteractTileHighlights|drawSmartCursor|drawMouseTextLayer/.test(s))) {
          window.__rec.log.push({ op: 'fillRect', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), fill: String(this.fillStyle), ga: +this.globalAlpha.toFixed(3), st });
        }
      }
      return FR.call(this, x, y, w, h);
    };
  }
});
await new Promise((r) => setTimeout(r, 1200));
const pos = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const cam = g.camera, z = cam.zoom ?? 1;
  return { sx: Math.round((n.cx - cam.x) * z + 640), sy: Math.round((n.cy - cam.y) * z + 400) };
});
await page.mouse.move(10, 10);
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => { window.__rec.log = []; });
const stOff = await page.evaluate(() => ({ wanted: window.__swGame.smartCursor.wanted, dist: window.__swGame.smartInteractNpcDist, tileWon: window.__swGame.smartInteractTileFrame?.tileWon ?? 'n/a', nCoords: window.__swGame.smartInteractTileFrame?.coords?.length ?? 'n/a' }));
await page.mouse.move(pos.sx, pos.sy);
await new Promise((r) => setTimeout(r, 600));
const rec = await page.evaluate(() => window.__rec.log);
const stOn = await page.evaluate(() => ({ wanted: window.__swGame.smartCursor.wanted, dist: window.__swGame.smartInteractNpcDist, npcId: window.__swGame.smartInteractNpcId, tileWon: window.__swGame.smartInteractTileFrame?.tileWon ?? 'n/a', nCoords: window.__swGame.smartInteractTileFrame?.coords?.length ?? 'n/a', coords: (window.__swGame.smartInteractTileFrame?.coords ?? []).slice(0, 12), sel: [...(window.__swGame.smartInteractTileFrame?.selected ?? [])].slice(0, 6) }));
console.log('stOff:', JSON.stringify(stOff));
console.log('stOn:', JSON.stringify(stOn));
console.log('rec count:', rec.length);
console.log(JSON.stringify(rec.slice(0, 30), null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
