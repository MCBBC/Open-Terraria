// ★BJ647-B v10：对齐用户实况 zoom=1.24（debug-report render.camera.zoom 实测）——
// 非整数缩放=亚像素采样/缝隙族。有头+hover 量化+逐帧 diff+截图。
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
// 对齐用户实况：zoom 1.24（zoomTarget 链）+白天+玩家贴巫医+pin
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
  window.__frames = []; window.__sampling = false;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const oc = document.createElement('canvas');
  oc.width = Math.ceil(cv.width / 8); oc.height = Math.ceil(cv.height / 8);
  const octx = oc.getContext('2d', { willReadFrequently: true });
  const tick0 = g.tickCount;
  const pump = () => {
    if (!window.__sampling) return;
    octx.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, oc.width, oc.height);
    const d = octx.getImageData(0, 0, oc.width, oc.height).data;
    const g8 = new Uint8Array(oc.width * oc.height);
    for (let i = 0, j = 0; j < g8.length; i += 4, j++) g8[j] = (d[i] + d[i + 1] + d[i + 2]) / 3 | 0;
    window.__frames.push({ t: g.tickCount - tick0, g: g8 });
    if (window.__frames.length > 1200) window.__frames.shift();
    requestAnimationFrame(pump);
  };
  window.__pump = pump;
});
await new Promise((r) => setTimeout(r, 1500));
const pos = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const cam = g.camera, z = cam.zoom ?? 1;
  return { sx: Math.round((n.cx - cam.x) * z + 756), sy: Math.round((n.cy - cam.y) * z + 431), zoom: cam.zoom };
});
console.log('npc screen:', JSON.stringify(pos));
await page.evaluate(() => { window.__sampling = true; window.__pump(); });
const fs = await import('node:fs');
for (let k = 0; k < 14; k++) {
  await page.mouse.move(pos.sx, pos.sy);
  await new Promise((r) => setTimeout(r, 650));
  if (k % 2 === 0) {
    const shot = await page.screenshot({ clip: { x: Math.max(0, pos.sx - 120), y: Math.max(0, pos.sy - 90), width: 240, height: 180 } });
    fs.writeFileSync(`/tmp/bj647-z124-hover-${k}.png`, shot);
  }
  await page.mouse.move(10, 10);
  await new Promise((r) => setTimeout(r, 450));
}
await page.evaluate(() => { window.__sampling = false; });
const dump = await page.evaluate(() => window.__frames);
console.log('frames:', dump.length);
const W = Math.sqrt(dump[0].g.length) | 0;
const events = [];
for (let f = 6; f < dump.length; f++) {
  const a = dump[f].g, b = dump[f - 1].g;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, cnt = 0, darkDrop = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    if (Math.abs(d) > 28) { cnt++; const x = i % W, y = (i / W) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (d < -28) darkDrop++; }
  }
  if (cnt > 25) events.push({ t: dump[f].t, cnt, darkDrop, box: [minX * 8, minY * 8, maxX * 8, maxY * 8] });
}
console.log('zoom1.24 frame-diff events:', events.length);
console.log(JSON.stringify(events.slice(0, 30), null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
