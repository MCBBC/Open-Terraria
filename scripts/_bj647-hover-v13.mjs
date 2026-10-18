// ★BJ647-B v13：puppeteer 直截名条区 + drawImage 源画布像素和（sil/mask 空源检测）。
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
  window.__srcProbe = [];
  if (!window.__hooked) {
    window.__hooked = true;
    const DI = CanvasRenderingContext2D.prototype.drawImage;
    window.__mtCalls = [];
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
      const st = new Error().stack || '';
      if (st.includes('drawBakedMouseText') && rest.length >= 4) {
        const call = { x: Math.round(rest[0]), y: Math.round(rest[1]), w: Math.round(rest[2]), h: Math.round(rest[3]) };
        // 源像素和（限 4 次采样防卡）
        try {
          const oc = document.createElement('canvas');
          oc.width = Math.min(160, img.width || 160); oc.height = Math.min(40, img.height || 40);
          const c2 = oc.getContext('2d');
          c2.drawImage(img, 0, 0, oc.width, oc.height);
          const d = c2.getImageData(0, 0, oc.width, oc.height).data;
          let sum = 0, mx = 0;
          for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i+1] + d[i+2]) / 3; sum += v; if (v > mx) mx = v; }
          call.srcAvg = Math.round(sum / (d.length / 4)); call.srcMax = Math.round(mx);
        } catch (e) { call.srcErr = String(e).slice(0, 40); }
        if (window.__mtCalls.length < 24) window.__mtCalls.push(call);
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
await page.mouse.move(pos.sx, pos.sy);
await new Promise((r) => setTimeout(r, 900));
const mt = await page.evaluate(() => window.__mtCalls);
console.log('mtCalls w/ src stats:', JSON.stringify(mt, null, 1));
// puppeteer 直截名条落点区（第一组 mt 落点）
if (mt.length) {
  const shot = await page.screenshot({ clip: { x: Math.max(0, mt[0].x - 24), y: Math.max(0, mt[0].y - 20), width: mt[0].w + 60, height: mt[0].h + 40 } });
  (await import('node:fs')).writeFileSync('/tmp/bj647-v13-nameplate.png', shot);
  console.log('nameplate shot saved');
}
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
