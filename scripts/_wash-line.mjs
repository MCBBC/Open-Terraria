// 水线时间序列:玩家入水/出水全过程,每帧读玩家所在列的水线 Y(世界 px)。
// 期望:入水瞬间水线被压下(下凹),出水瞬间被拉起(上凸),静止后回平。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync('/Users/vinlic/Downloads/map-浮夸的羡慕顶峰 (7).json', 'utf8');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wash-profile5',
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
        // 开阔水面:左右各 3 格也是水(避免岸边干扰)
        if (st.liquid[st.idx(x, y)] > 200 && st.liquid[st.idx(x - 3, y)] > 200
          && st.liquid[st.idx(x + 3, y)] > 200 && st.liquid[st.idx(x, y - 3)] === 0
          && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y - 3)]) { spot = { x, y }; break outer; }
      }
    }
  }
  if (!spot) return { err: 'no water' };
  g.player.debugGod = true;
  g.player.x = spot.x * 16; g.player.y = (spot.y - 10) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.follow = function () {};
  g.camera.x = spot.x * 16; g.camera.y = spot.y * 16;
  if (g.world.clock) g.world.clock.timeOfDay = 0.4;
  await new Promise((res) => setTimeout(res, 600));

  // 水线读数:玩家列,从 (y-3)*16 向下扫,首个"前景水色"像素的世界 Y
  const readLineAt = (colX) => {
    const cv = g.renderer.canvas;
    const c2 = cv.getContext('2d');
    const dpr = cv.width / (cv.clientWidth || 1280);
    const z = g.camera.zoom;
    const [sx] = g.camera.worldToScreen(colX * 16, 0);
    const [s0] = g.camera.worldToScreen(0, (spot.y - 3) * 16);
    const [s1] = g.camera.worldToScreen(0, (spot.y + 2) * 16);
    const pxX = Math.round((sx + 8 * z) * dpr);
    for (let wy = (spot.y - 3) * 16; wy < (spot.y + 2) * 16; wy += 0.5) {
      const [, sy] = g.camera.worldToScreen(0, wy);
      const yy = Math.round(sy * dpr);
      if (yy >= cv.height) break;
      const d = c2.getImageData(pxX, yy, 1, 1).data;
      // 前景水 = 蓝分量显著高于红且非天空(天空浅蓝 R 高)
      if (d[2] > 90 && d[2] > d[0] + 40 && d[0] < 120) return wy;
    }
    return -1;
  };

  const seq = [];
  // 阶段1:静止基线(20 帧)
  for (let f = 0; f < 20; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    if (f === 19) seq.push({ ph: 'rest', line: readLineAt(spot.x), py: Math.round(g.player.y) });
  }
  // 阶段2:从高处落入
  g.player.y = (spot.y - 12) * 16; g.player.vy = 0;
  for (let f = 0; f < 50; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    if (f % 3 === 0) seq.push({ ph: 'in', f, line: readLineAt(spot.x), py: Math.round(g.player.y),
      inW: g.player.inWater, wet: g.player.wetCount, vy: Math.round(g.player.vy * 100) / 100 });
  }
  // 阶段3:出水(向上踢)
  g.player.vy = -8;
  for (let f = 0; f < 40; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    if (f % 3 === 0) seq.push({ ph: 'out', f, line: readLineAt(spot.x), py: Math.round(g.player.y),
      inW: g.player.inWater, wet: g.player.wetCount, vy: Math.round(g.player.vy * 100) / 100 });
  }
  // 阶段4:水中高速游动(洗掠拖尾)——读玩家列与左右 3 格列的水线差
  g.player.vy = 0;
  const lines3 = [];
  for (let f = 0; f < 60; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    g.player.vx = (f % 20 < 10 ? 3 : -3);
    if (f % 6 === 0) {
      const c0 = readLineAt(spot.x), cL = readLineAt(spot.x - 2), cR = readLineAt(spot.x + 2);
      lines3.push({ f, c0, cL, cR, spread: (c0 >= 0 && cL >= 0 && cR >= 0) ? Math.max(Math.abs(c0 - cL), Math.abs(c0 - cR)) : -1 });
    }
  }
  return { spot, seq, lines3 };
});
for (const s of out.seq) console.log(JSON.stringify(s));
console.log('=== swim spread ===');
for (const s of (out.lines3 ?? [])) console.log(JSON.stringify(s));
await browser.close();
