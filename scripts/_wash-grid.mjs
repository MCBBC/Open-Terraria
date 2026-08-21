// 波场 R 值直读:玩家入水后,读玩家中心对应波场格的 R 值分布(应显著偏离 0.5)。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync('/Users/vinlic/Downloads/map-浮夸的羡慕顶峰 (7).json', 'utf8');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wash-profile4',
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

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  let spot = null;
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  outer:
  for (let r = 10; r < 200; r += 4) {
    for (const dx of [-r, r]) {
      for (let dy = -30; dy < 30; dy += 3) {
        const x = px + dx, y = py + dy;
        if (!st.inBounds(x, y)) continue;
        if (st.liquid[st.idx(x, y)] > 200 && st.liquid[st.idx(x, y - 3)] === 0
          && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y - 3)]) { spot = { x, y }; break outer; }
      }
    }
  }
  if (!spot) return { err: 'no water' };
  const ww = (await import('/src/render/WaterWaves.ts')).waterWaves;
  const r = g.renderer;
  g.player.debugGod = true;
  g.player.x = spot.x * 16; g.player.y = (spot.y - 8) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.follow = function () {};
  g.camera.x = spot.x * 16; g.camera.y = spot.y * 16;
  if (g.world.clock) g.world.clock.timeOfDay = 0.4;
  await new Promise((res) => setTimeout(res, 800));
  // 玩家自由落体入水;入水后读玩家中心±16px 的 R 值
  g.player.y = (spot.y - 8) * 16; g.player.vy = 0;
  const reads = [];
  for (let f = 0; f < 100; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    if (f >= 20 && g.player.inWater && f % 4 === 0) {
      // 波场格 = (world - cam)*zoom*0.25(css px 系)
      const cssScale = r.canvas.width / (r.canvas.clientWidth || 1280);
      const zCss = g.camera.zoom / cssScale;
      const camL = g.camera.x - r.canvas.width / (2 * g.camera.zoom);
      const camT = g.camera.y - r.canvas.height / (2 * g.camera.zoom);
      const gw = ww.gridW(), gh = ww.gridH();
      const R = ww.readGridR();
      const pcx = (g.player.x + 12 - camL) * zCss * 0.25;
      const pcy = (g.player.y + 21 - camT) * zCss * 0.25;
      let mn = 1, mx = 0, sum = 0, n = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const gx = Math.round(pcx + dx), gy = Math.round(pcy + dy);
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
        const v = R[gy * gw + gx];
        if (v < mn) mn = v; if (v > mx) mx = v; sum += v; n++;
      }
      reads.push({ f, inWater: g.player.inWater, vy: Math.round(g.player.vy * 100) / 100,
        Rmin: +mn.toFixed(3), Rmax: +mx.toFixed(3), Ravg: +(sum / n).toFixed(3), n });
    }
  }
  return { spot, reads };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
