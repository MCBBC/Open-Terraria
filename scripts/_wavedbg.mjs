import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));
// 找水面
const water = await page.evaluate(() => {
  const g = window.__swGame; const st = g.world.store;
  for (let y = Math.floor(g.world.groundLevel); y < Math.floor(g.world.groundLevel) + 200; y++) {
    for (let x = 100; x < st.w - 100; x++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 200 && st.liquid[st.idx(x, y - 1)] === 0) {
        let run = 0;
        for (let k = x; k < x + 12; k++) {
          const j = st.idx(k, y);
          if (st.liquid[j] > 200 && st.liquid[st.idx(k, y - 1)] === 0 && !st.flags[j]) run++; else break;
        }
        if (run >= 8) return { x: x + 4, y };
      }
    }
  }
  return null;
});
console.log('water cell:', JSON.stringify(water));
await page.evaluate((wx, wy) => {
  const g = window.__swGame;
  g.player.x = wx * 16; g.player.y = wy * 16; g.player.vx = 0; g.player.vy = 0;
}, water.x, water.y);
await new Promise((r) => setTimeout(r, 2000));
// 相机实际位置 vs 玩家
const dbg = await page.evaluate(async () => {
  const g = window.__swGame;
  const t1 = g.renderer._liquidNow;
  await new Promise((r) => setTimeout(r, 300));
  const t2 = g.renderer._liquidNow;
  return { camX: g.camera.x, camY: g.camera.y, pX: g.player.cx, pY: g.player.cy, t1, t2, liquidNowAdvances: t2 > t1 };
});
console.log('dbg:', JSON.stringify(dbg));
// 主 canvas 像素:玩家中心附近的液面带(屏幕中心 ±24)
const shots = [];
for (let k = 0; k < 3; k++) {
  const buf = await page.screenshot({ clip: { x: 640 - 200, y: 400 - 24, width: 400, height: 56 } });
  shots.push(PNG.sync.read(buf));
  await new Promise((r) => setTimeout(r, 200));
}
let diff = 0, blueA = 0;
for (let p = 0; p < shots[0].data.length; p += 4) {
  if (Math.abs(shots[0].data[p] - shots[1].data[p]) > 6) diff++;
  const d = shots[0].data;
  if (d[p + 3] > 60 && d[p + 2] > d[p] + 20) blueA++;
}
console.log('diff px:', diff, 'blue-ish px:', blueA);
await browser.close();
