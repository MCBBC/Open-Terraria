// 洗掠注入实测:玩家跳入水中,逐帧读波场 R 值在玩家位置的变化 + 涟漪队列。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync(needInput(join(DOWNLOADS, 'map-浮夸的羡慕顶峰 (7).json')), 'utf8');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/wash-profile'),
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

const pre = await page.evaluate(() => {
  const g = window.__swGame;
  return { q: g.options?.data?.waveQuality, gates: JSON.stringify(window.__swGame?.renderer ? {} : {}) };
});
console.log('[waveQuality]', pre.q);

// 找玩家附近水域:从出生点向左右扫
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
          return { x: x * 16, y: (y - 2) * 16 };
        }
      }
    }
  }
  return null;
});
console.log('[water spot]', spot);
if (!spot) process.exit(0);

// 玩家传送到水面上方,自由落体入水,采样波场
const frames = await page.evaluate(async (spot) => {
  const g = window.__swGame;
  const r = g.renderer;
  const { waterWaves } = await import('/src/render/WaterWaves.ts');
  g.player.debugGod = true;
  g.player.x = spot.x; g.player.y = spot.y - 80;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.follow = function () {};
  g.camera.x = spot.x; g.camera.y = spot.y;
  const samples = [];
  const readField = (label) => {
    const d = waterWaves.debug();
    // 玩家中心附近 8x8 格的最大 |R-0.5|
    const z = g.camera.zoom / (r._cssW ? viewScale() : 1);
    return { label, ...d };
  };
  const viewScale = () => 1;
  for (let f = 0; f < 90; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    if (f % 10 === 0) {
      const d = waterWaves.debug();
      samples.push({ f, active: d.activeTexels, steps: d.stepsLastFrame, rq: d.rippleQueueUsed,
        px: Math.round(g.player.x), py: Math.round(g.player.y), inWater: g.player.inWater, wet: g.player.wetCount });
    }
  }
  return samples;
}, spot);
for (const s of frames) console.log(JSON.stringify(s));
await browser.close();
