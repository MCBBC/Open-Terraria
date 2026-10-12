// ★BJ647-B v12：逐帧 PNG 存盘目验「黑框无字」帧 + 读名条 color 源。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = '/Users/vinlic/Downloads/十周年纪念种子(2).wld';
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
  window.__cap = { on: false, shots: [] };
  if (!window.__hooked) {
    window.__hooked = true;
    const DI = CanvasRenderingContext2D.prototype.drawImage;
    window.__mtLog = [];
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
      const st = new Error().stack || '';
      if (st.includes('drawBakedMouseText') && rest.length >= 4) {
        window.__mtLog.push({ x: Math.round(rest[0]), y: Math.round(rest[1]), w: Math.round(rest[2]), h: Math.round(rest[3]) });
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
// 逐帧抓名条区 PNG（页内 toDataURL 收集）
await page.evaluate((anchor) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  window.__cap = { on: true, shots: [] };
  const oc = document.createElement('canvas');
  oc.width = 180; oc.height = 36;
  const octx = oc.getContext('2d', { willReadFrequently: true });
  window.__capX0 = anchor.mx + 8; window.__capY0 = anchor.my + 4;
  const pump = () => {
    if (!window.__cap.on || window.__cap.shots.length >= 24) { window.__cap.on = false; return; }
    octx.clearRect(0, 0, 180, 36);
    octx.drawImage(cv, window.__capX0, window.__capY0, 180, 36, 0, 0, 180, 36);
    window.__cap.shots.push(oc.toDataURL());
    requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
}, { mx: pos.sx, my: pos.sy });
await page.mouse.move(pos.sx, pos.sy);
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => { window.__cap.on = false; });
const cap = await page.evaluate(() => ({ shots: window.__cap.shots, mt: window.__mtLog.slice(0, 4), mtColorProbe: (() => { try { return window.__swGame.lighting?.clock?.mouseTextColor; } catch { return null; } })() }));
console.log('shots:', cap.shots.length, 'mouseTextColor:', cap.mtColorProbe);
const fs = await import('node:fs');
cap.shots.forEach((d, i) => {
  const b = Buffer.from(d.split(',')[1], 'base64');
  fs.writeFileSync(`/tmp/bj647-v12-frame-${String(i).padStart(2, '0')}.png`, b);
});
console.log('mtCalls:', JSON.stringify(cap.mt));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
