// _lavaslope-repro17: 用户世界 (2018,1123) 岩浆半砖(wall=0, L/R/U=255) 的 drawImage 探针。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const MAP = '/Users/vinlic/Downloads/map-饥饿的庄园 (1).json';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 },
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const p = await b.newPage();
let booted = false;
for (let attempt = 0; attempt < 3 && !booted; attempt++) {
  await p.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson).catch(() => false)) { booted = true; break; }
  }
}
if (!booted) { console.log('FAIL boot'); await b.close(); process.exit(1); }
await p.evaluate(async t => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame?.world?.store?.w).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => {
  const g = window.__swGame;
  g.liquid.updateLiquid = () => {};
  g.player.debugGod = true; g.player.hp = g.player.maxHp; g.player.dead = false;
});
await p.evaluate(() => {
  const g = window.__swGame, pl = g.player;
  pl.x = 2018 * 16 - pl.w / 2; pl.y = (1123 - 6) * 16;
  pl.vx = 0; pl.vy = 0;
  g.camera.x = pl.x + pl.w / 2; g.camera.y = pl.y + pl.h / 2;
});
await p.bringToFront();
for (let k = 0; k < 10; k++) {
  await p.evaluate(() => {
    const g = window.__swGame, pl = g.player;
    pl.x = 2018 * 16 - pl.w / 2; pl.y = (1123 - 6) * 16;
    g.camera.x = pl.x + pl.w / 2; g.camera.y = pl.y + pl.h / 2;
  });
  await new Promise(r => setTimeout(r, 150));
}
await p.evaluate(() => {
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__origDrawImage) {
    proto.__origDrawImage = proto.drawImage;
    window.__liqCalls = [];
    proto.drawImage = function (img, ...rest) {
      try {
        if (rest.length >= 8) {
          const src = img ? (img.src ? String(img.src).split('/').pop() : `bmp${img.width}x${img.height}`) : 'null';
          window.__liqCalls.push({ src, a: rest.slice(0, 8).map(v => Math.round(v * 10) / 10) });
        }
      } catch (e) { /* ignore */ }
      return proto.__origDrawImage.call(this, img, ...rest);
    };
  }
  window.__liqCalls.length = 0;
});
await new Promise(r => setTimeout(r, 400));
const calls = await p.evaluate(() => window.__liqCalls);
console.log('总调用:', calls.length);
const near = calls.filter(c => Math.abs(c.a[4] - 2018 * 16) < 40 && Math.abs(c.a[5] - 1123 * 16) < 40);
console.log('(2018,1123) 半砖格近旁调用:', near.length);
for (const n of near.slice(0, 12)) console.log('  ', JSON.stringify(n));
// 顺便:同屏一个普通液体格与一个普通石格对照
const bodyNear = calls.filter(c => Math.abs(c.a[4] - 2019 * 16) < 40 && Math.abs(c.a[5] - 1123 * 16) < 40);
console.log('(2019,1123) 邻格调用:', bodyNear.length, bodyNear.slice(0, 3).map(n => JSON.stringify(n)).join(' '));
await b.close();
process.exit(0);
