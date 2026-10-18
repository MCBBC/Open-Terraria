// ★BJ647-B v11：hover 首帧起逐帧抓名条区——抓「黑框无字」（sil 层可见/tint 层丢失）帧。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = needInput(join(DOWNLOADS, '十周年纪念种子(2).wld'));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false,
  defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 1 },
  args: ['--window-size=1530,960', '--window-position=30,30'],
});
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
await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  g.world.clock.timeOfDay = 0.5;
  if (g.options?.data && 'gameZoom' in g.options.data) g.options.data.gameZoom = 1.24;
  g.camera.zoom = 1.24; g.camera.zoomTarget = 1.24;
  window.__bjAnchor = { x: n.cx, y: n.cy };
  g.player.x = n.cx - 50; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
  }, 150);
  // hook drawBakedMouseText 落点+每帧名条区抓帧
  window.__cap = { frames: [], on: false };
  if (!window.__hooked) {
    window.__hooked = true;
    const DI = CanvasRenderingContext2D.prototype.drawImage;
    window.__mtCalls = [];
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
      const st = new Error().stack || '';
      if (st.includes('drawBakedMouseText') && rest.length >= 4) {
        window.__mtCalls.push({ x: Math.round(rest[0]), y: Math.round(rest[1]), w: Math.round(rest[2]), h: Math.round(rest[3]) });
      }
      return DI.call(this, img, ...rest);
    };
  }
});
await new Promise((r) => setTimeout(r, 1200));
const pos = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const cam = g.camera, z = cam.zoom ?? 1;
  return { sx: Math.round((n.cx - cam.x) * z + 756), sy: Math.round((n.cy - cam.y) * z + 431) };
});
console.log('npc screen:', JSON.stringify(pos));
// hover 开始：逐帧抓名条预期区（鼠标右下偏移 16,+10 附近 160×30）25 帧
await page.evaluate((anchor) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  window.__cap.frames = []; window.__cap.on = true;
  const oc = document.createElement('canvas');
  oc.width = 200; oc.height = 40;
  const octx = oc.getContext('2d', { willReadFrequently: true });
  const X0 = anchor.mx + 6, Y0 = anchor.my + 2;
  const pump = () => {
    if (!window.__cap.on || window.__cap.frames.length >= 25) return;
    octx.clearRect(0, 0, 200, 40);
    octx.drawImage(cv, X0, Y0, 200, 40, 0, 0, 200, 40);
    const d = octx.getImageData(0, 0, 200, 40).data;
    let white = 0, black = 0, tot = 0;
    for (let i = 0; i < d.length; i += 4) {
      tot++;
      if (d[i] > 225 && d[i+1] > 225 && d[i+2] > 225) white++;
      if (d[i] < 45 && d[i+1] < 45 && d[i+2] < 45) black++;
    }
    window.__cap.frames.push({ t: g.tickCount, white, black, mt: window.__mtCalls.length });
    requestAnimationFrame(pump);
  };
  window.__capX0 = X0; window.__capY0 = Y0;
  requestAnimationFrame(pump);
}, { mx: pos.sx, my: pos.sy });
await page.mouse.move(pos.sx, pos.sy);
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => { window.__cap.on = false; });
const cap = await page.evaluate(() => ({ frames: window.__cap.frames, mt: window.__mtCalls.slice(0, 6), X0: window.__capX0, Y0: window.__capY0 }));
console.log('frames:', cap.frames.length);
console.log(JSON.stringify(cap.frames, null, 0));
console.log('mtCalls:', JSON.stringify(cap.mt));
// 存首帧/次帧 PNG 供目验
await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  window.__shots = [];
  for (let k = 0; k < 6; k++) {
    const o = document.createElement('canvas');
    o.width = 200; o.height = 40;
    o.getContext('2d').drawImage(cv, window.__capX0, window.__capY0, 200, 40, 0, 0, 200, 40);
    void o;
  }
});
const fs = await import('node:fs');
// Node 侧：每帧把名条区重新截（当前已稳定态）——首帧图只能靠 canvas 采样缓存,改存白/黑比率曲线即可
fs.writeFileSync('/tmp/bj647-v11-cap.json', JSON.stringify(cap));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
