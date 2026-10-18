// ★BJ647-B v14 终局：zoom=1.24 + NPC 挪出 UI 区 + hover 循环逐帧抓名条 PNG——
// 抓「黑框无字」（sil 黑剪影可见/tint 白字丢失）帧。
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
  // 玩家贴 NPC 且把两者放到画面中上（camera 每帧跟玩家→玩家位置=画面中心）
  g.player.x = n.cx - 50; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
  }, 150);
  window.__cap = { on: false, shots: [] };
});
await new Promise((r) => setTimeout(r, 1500));
const pos = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const cam = g.camera, z = cam.zoom ?? 1;
  const cw = g.renderer.canvas.clientWidth ?? 1512, ch = g.renderer.canvas.clientHeight ?? 862;
  return { sx: Math.round((n.cx - cam.x) * z + cw / 2), sy: Math.round((n.cy - cam.y) * z + ch / 2), zoom: cam.zoom };
});
console.log('npc screen:', JSON.stringify(pos));
const fs = await import('node:fs');
let saved = 0;
for (let round = 0; round < 5; round++) {
  // hover 循环：off→on，on 后逐帧抓 12 帧
  await page.mouse.move(10, 10);
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => { window.__cap = { on: true, shots: [] }; });
  const pos2 = await page.evaluate(() => {
    const g = window.__swGame;
    const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    const cam = g.camera, z = cam.zoom ?? 1;
    const cw = g.renderer.canvas.clientWidth ?? 1512, ch = g.renderer.canvas.clientHeight ?? 862;
    return { sx: Math.round((n.cx - cam.x) * z + cw / 2), sy: Math.round((n.cy - cam.y) * z + ch / 2) };
  });
  await page.evaluate((anchor) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas ?? document.querySelector('canvas');
    const oc = document.createElement('canvas');
    oc.width = 190; oc.height = 34;
    const octx = oc.getContext('2d', { willReadFrequently: true });
    window.__capX0 = anchor.mx - 30; window.__capY0 = anchor.my + 6;
    const pump = () => {
      if (!window.__cap.on || window.__cap.shots.length >= 12) { window.__cap.on = false; return; }
      octx.clearRect(0, 0, 190, 34);
      octx.drawImage(cv, window.__capX0, window.__capY0, 190, 34, 0, 0, 190, 34);
      window.__cap.shots.push(oc.toDataURL());
      requestAnimationFrame(pump);
    };
    requestAnimationFrame(pump);
  }, { mx: pos2.sx, my: pos2.sy });
  await page.mouse.move(pos2.sx, pos2.sy);
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => { window.__cap.on = false; });
  const shots = await page.evaluate(() => window.__cap.shots);
  shots.forEach((d, i) => {
    const buf = Buffer.from(d.split(',')[1], 'base64');
    fs.writeFileSync(`/tmp/bj647-v14-r${round}-f${String(i).padStart(2, '0')}.png`, buf);
    saved++;
  });
}
console.log('saved frames:', saved);
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
