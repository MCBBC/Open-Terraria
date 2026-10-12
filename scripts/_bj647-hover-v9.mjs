// ★BJ647-B v9：有头浏览器（headful）复现——合成器/GPU 管线与 headless 不同,
// 黑矩形可能只在有头渲染路径出现。组合：量化 hover 循环+逐帧 diff+hook。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = '/Users/vinlic/Downloads/十周年纪念种子(2).wld';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false,
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  args: ['--window-size=1300,900', '--window-position=40,40'],
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
  window.__bjAnchor = { x: n.cx, y: n.cy };
  g.player.x = n.cx - 50; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
  }, 150);
  // 逐帧采样器
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
    if (window.__frames.length > 900) window.__frames.shift();
    requestAnimationFrame(pump);
  };
  window.__pump = pump;
});
await new Promise((r) => setTimeout(r, 1200));
const pos = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const cam = g.camera, z = cam.zoom ?? 1;
  return { sx: Math.round((n.cx - cam.x) * z + 640), sy: Math.round((n.cy - cam.y) * z + 400) };
});
console.log('npc screen:', JSON.stringify(pos));
// ---- 逐帧采样 + hover 循环 40s（含 hover on/off 与静置）----
await page.evaluate(() => { window.__sampling = true; window.__pump(); });
const fs = await import('node:fs');
let hoverShots = 0;
for (let k = 0; k < 12; k++) {
  await page.mouse.move(pos.sx, pos.sy);
  await new Promise((r) => setTimeout(r, 700));
  if (k % 3 === 0) {
    const shot = await page.screenshot({ clip: { x: Math.max(0, pos.sx - 110), y: Math.max(0, pos.sy - 80), width: 220, height: 160 } });
    fs.writeFileSync(`/tmp/bj647-headful-hover-${k}.png`, shot);
    hoverShots++;
  }
  await page.mouse.move(10, 10);
  await new Promise((r) => setTimeout(r, 500));
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
    if (Math.abs(d) > 35) { cnt++; const x = i % W, y = (i / W) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (d < -35) darkDrop++; }
  }
  if (cnt > 40) events.push({ t: dump[f].t, cnt, darkDrop, box: [minX * 8, minY * 8, maxX * 8, maxY * 8] });
}
console.log('headful frame-diff events:', events.length);
console.log(JSON.stringify(events.slice(0, 30), null, 1));
console.log('hover shots saved:', hoverShots);
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
