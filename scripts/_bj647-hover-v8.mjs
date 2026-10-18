// ★BJ647-B v8 终局：日出时钟翻转 + 逐帧 diff 序列——抓瞬态暗帧的精确 tick 与区域。
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
// 场景：夜末（timeOfDay≈0.99 日出前沿）+玩家贴巫医+pin+鼠标 hover NPC
await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  g.world.clock.timeOfDay = 0.985;   // 日出前沿
  window.__bjAnchor = { x: n.cx, y: n.cy };
  g.player.x = n.cx - 50; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
  }, 150);
  // 逐帧采样：灰度 1/8 抽样矩阵环形缓冲
  window.__frames = [];
  window.__sampling = true;
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
  requestAnimationFrame(pump);
});
await new Promise((r) => setTimeout(r, 800));
const pos = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const cam = g.camera, z = cam.zoom ?? 1;
  return { sx: Math.round((n.cx - cam.x) * z + 640), sy: Math.round((n.cy - cam.y) * z + 400) };
});
await page.mouse.move(pos.sx, pos.sy);   // hover 开始（含日出翻越）
await new Promise((r) => setTimeout(r, 9000));   // 覆盖日出翻转
await page.evaluate(() => { window.__sampling = false; });
const data = await page.evaluate(() => ({ w: window.__frames[0]?.g.length ? Math.sqrt(window.__frames[0].g.length) | 0 : 0, frames: window.__frames.map((f) => ({ t: f.t })) }));
// Node 侧逐帧 diff：帧 vs 前 12 帧中位——暗块=显著变暗的连通区
const dump = await page.evaluate(() => window.__frames);
console.log('frames:', dump.length);
const W = Math.sqrt(dump[0].g.length) | 0, H = W;
const events = [];
for (let f = 12; f < dump.length; f++) {
  // 与前帧 diff
  const a = dump[f].g, b = dump[f - 1].g;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, cnt = 0, darkDrop = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    if (Math.abs(d) > 45) { cnt++; const x = i % W, y = (i / W) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (d < -45) darkDrop++; }
  }
  if (cnt > 60) events.push({ t: dump[f].t, cnt, darkDrop, box: [minX * 8, minY * 8, maxX * 8, maxY * 8] });
}
console.log('frame-diff events (cnt>60):', events.length);
console.log(JSON.stringify(events.filter((e) => e.darkDrop > 30).slice(0, 24), null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
