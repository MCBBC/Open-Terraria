// ★BJ647-B v17 终局：鼠标悬旗布矩形（v16 实测旗屏位 (938,537)）——昼夜两态黑框名条对比。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = '/Users/vinlic/Downloads/十周年纪念种子(2).wld';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 1 }, args: ['--window-size=1530,960', '--window-position=30,30'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&beh=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90; i++) { if (await page.evaluate(() => !!(window.__swGame?.renderer)).catch(() => false)) break; await new Promise((r) => setTimeout(r, 2000)); }
await new Promise((r) => setTimeout(r, 1500));
const b64 = readFileSync(WLD).toString('base64');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await window.__swFlow.importWld(u8);
}, b64);
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => {
    const g = window.__swGame;
    return !!(g?.world?.store?.type?.length > 1000000 && g.world.name === '十周年纪念种子' && g.entities?.npcs?.some((n) => n.npcKey === 'witch_doctor'));
  }).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
await page.evaluate(() => {
  const g = window.__swGame;
  if (g.options?.data && 'gameZoom' in g.options.data) g.options.data.gameZoom = 1.24;
  g.camera.zoom = 1.24; g.camera.zoomTarget = 1.24;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  window.__bjAnchor = { x: n.cx, y: n.cy };
  g.player.x = n.cx - 50; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
  }, 150);
});
await new Promise((r) => setTimeout(r, 1200));
// 旗屏位每态重算（home.x*16+8, cy*16+21）
const fs = await import('node:fs');
for (const [tag, tod] of [['night', 0.02], ['day', 0.5]]) {
  await page.evaluate((tod) => { window.__swGame.world.clock.timeOfDay = tod; }, tod);
  await new Promise((r) => setTimeout(r, 700));
  const bp = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    const cam = g.camera, z = cam.zoom ?? 1;
    const cw = g.renderer.canvas.clientWidth ?? 1512, ch = g.renderer.canvas.clientHeight ?? 862;
    let cy = null;
    for (let y = n.home.y - 1; y > n.home.y - 30 && y > 0; y--) {
      if (st.isSolid(n.home.x, y) || st.isPlatform(n.home.x, y)) { cy = y; break; }
    }
    return { sx: Math.round((n.home.x * 16 + 8 - cam.x) * z + cw / 2), sy: Math.round((cy * 16 + 21 - cam.y) * z + ch / 2) };
  });
  await page.mouse.move(bp.sx, bp.sy);
  await new Promise((r) => setTimeout(r, 500));
  const shot = await page.screenshot({ clip: { x: Math.max(0, bp.sx - 110), y: Math.max(0, bp.sy - 60), width: 240, height: 110 } });
  fs.writeFileSync(`/tmp/bj647-v17-banner-${tag}.png`, shot);
  const stat = await page.evaluate(({ sx, sy }) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas ?? document.querySelector('canvas');
    const o = document.createElement('canvas');
    o.width = 180; o.height = 26;
    const c = o.getContext('2d', { willReadFrequently: true });
    c.drawImage(cv, sx - 90, sy - 56, 180, 26, 0, 0, 180, 26);
    const d = c.getImageData(0, 0, 180, 26).data;
    let bright = 0;
    for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; if (v > 190) bright++; }
    return { bright };
  }, bp);
  console.log(tag, 'banner textband brightPx:', JSON.stringify(stat));
}
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
