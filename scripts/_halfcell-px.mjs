// 半砖格自身 16x16 像素转储:验证 IsHalfBrick 满格水体(行0-8 应为水色)是否渲染。
// 窗口 = 半砖格 + 右侧标注格(32 宽)。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync(needInput(join(DOWNLOADS, 'map-浮夸的羡慕顶峰 (5).json')), 'utf8');
// [半砖格x, 半砖格y](标注格 = +1)
const cells = JSON.parse(process.env.SW_CELLS ?? '[[881,282],[845,280]]');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/wetslope-profile16'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));

for (const [hx, hy] of cells) {
  await page.evaluate((x, y) => {
    const g = window.__swGame;
    g.player.debugGod = true;
    g.player.x = x * 16 + 24; g.player.y = (y + 10) * 16 + 8;
    g.camera.setZoomTarget(2); g.camera.zoom = 2;
    g.camera.follow = function () {};
    g.camera.x = x * 16 + 16; g.camera.y = y * 16 + 8;   // 窗口中心 = 半砖格与标注格之间
    if (g.world.clock) g.world.clock.timeOfDay = 0.35;
    if (g.renderer) g.renderer.fullbright = true;
  }, hx, hy);
  await new Promise((r) => setTimeout(r, 2200));
  const dump = await page.evaluate((x, y) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const c2 = cv.getContext('2d');
    const [sx, sy] = g.camera.worldToScreen(x * 16, y * 16);
    const z = g.camera.zoom;
    const dpr = cv.width / (cv.clientWidth || 1280);
    const rows = [];
    for (let ty = 0; ty < 16; ty++) {
      const row = [];
      for (let tx = 0; tx < 32; tx++) {
        const px = Math.round((sx + (tx + 0.5) * z) * dpr);
        const py = Math.round((sy + (ty + 0.5) * z) * dpr);
        const d = c2.getImageData(Math.min(px, cv.width - 1), Math.min(py, cv.height - 1), 1, 1).data;
        row.push([d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
      }
      rows.push(row);
    }
    const st = g.world.store;
    const i = st.idx(x, y);
    return { rows, halfLq: st.liquid[i], upLq: st.liquid[st.idx(x, y - 1)] };
  }, hx, hy);
  console.log(`\n== half(${hx},${hy}) lq=${dump.halfLq} upLq=${dump.upLq} — 左16列=半砖格 右16列=标注格`);
  dump.rows.forEach((r, y) => console.log(` y${String(y).padStart(2, '0')} ` + r.join(' ')));
  await page.screenshot({
    path: `${HOME}/.claude/jobs/8405c930/tmp/wetslope/half-${hx}-${hy}.png`,
    clip: { x: 1280 / 2 - 96, y: 800 / 2 - 96, width: 192, height: 192 },
  });
}
await browser.close();
