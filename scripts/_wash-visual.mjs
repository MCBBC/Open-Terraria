// 洗掠视觉验证:玩家跳入水,连拍 6 帧水线区截图 + 逐像素水线 Y 读数。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
const mapStr = readFileSync(needInput(join(DOWNLOADS, 'map-浮夸的羡慕顶峰 (7).json')), 'utf8');
const OUT = join(HOME, '.claude/jobs/8405c930/tmp/wash');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/wash-profile2'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2000));

const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  for (let r = 10; r < 200; r += 4) {
    for (const dx of [-r, r]) {
      for (let dy = -30; dy < 30; dy += 3) {
        const x = px + dx, y = py + dy;
        if (!st.inBounds(x, y)) continue;
        if (st.liquid[st.idx(x, y)] > 200 && st.liquid[st.idx(x, y - 3)] === 0
          && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y - 3)]) {
          return { x: x * 16, y: (y - 2) * 16, ty: y };
        }
      }
    }
  }
  return null;
});
console.log('[spot]', spot);

// 静止水面基线:水线 Y 读数(每列首个水色像素)
const readLine = () => page.evaluate((ty) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const c2 = cv.getContext('2d');
  const st = g.world.store;
  // 找水面上方一格的世界坐标
  const lines = [];
  for (let col = -6; col <= 6; col++) {
    const x = Math.floor(g.player.x / 16) + col;
    const [sx, sy] = g.camera.worldToScreen(x * 16, (ty - 2) * 16);
    const z = g.camera.zoom;
    const dpr = cv.width / (cv.clientWidth || 1280);
    let lineY = -1;
    for (let py = 0; py < 48 * z * dpr; py += Math.max(1, Math.round(z * dpr * 0.25))) {
      const px = Math.round((sx + 8 * z) * dpr);
      const yy = Math.round((sy + py / dpr) * dpr);
      if (yy >= cv.height) break;
      const d = c2.getImageData(px, yy, 1, 1).data;
      if (d[2] > d[0] + 20 && d[2] > d[1] + 10) { lineY = py / dpr; break; }
    }
    lines.push(lineY);
  }
  return lines;
}, spot.ty);

await page.evaluate((s) => {
  const g = window.__swGame;
  g.player.debugGod = true;
  g.player.x = s.x; g.player.y = s.y - 120;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.follow = function () {};
  g.camera.x = s.x; g.camera.y = s.y;
  if (g.world.clock) g.world.clock.timeOfDay = 0.4;
}, spot);
await new Promise((r) => setTimeout(r, 1500));
const base = await readLine();
console.log('[baseline waterline per column]', JSON.stringify(base));

// 入水:从高处落下,入水瞬间起连拍
await page.evaluate((s) => {
  const g = window.__swGame;
  g.player.x = s.x; g.player.y = s.y - 120;
  g.player.vy = 0;
}, spot);
const seq = [];
for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 50));
  const st = await page.evaluate(() => {
    const g = window.__swGame;
    return { inWater: g.player.inWater, vy: Math.round(g.player.vy * 100) / 100, y: Math.round(g.player.y) };
  });
  seq.push(st);
  if (i === 8 || i === 10 || i === 12) {
    const lines = await readLine();
    const path = `${OUT}/splash-${String(i).padStart(2, '0')}.png`;
    await page.screenshot({ path, clip: { x: 1280 / 2 - 160, y: 800 / 2 - 120, width: 320, height: 240 } });
    console.log(`[f${i}]`, JSON.stringify(st), 'waterline=', JSON.stringify(lines));
  }
}
console.log('[seq tail]', JSON.stringify(seq.slice(6, 20)));
await browser.close();
