// 一次性验证:EoC 头顶血条 vs 眼球贴图相对位置(白天环境光,快扫防漂离)
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=500000 scripts/_eoc-bar-pos.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.45; g.world.clock.isDay = true;  // 白天环境光
  g.debugSpawnNpc(4, 1, false);
  await new Promise((r) => setTimeout(r, 2500));
  const eye = g.entities.all().filter((e) => e.vanillaId === 4).pop();
  if (!eye) return { err: 'no eye' };
  eye.hurt(500, 0, 0, g);
  await new Promise((r) => setTimeout(r, 250));
  // 几何基准
  const spriteBottom = eye.spriteBottomWorld;
  const barY = Math.max(eye.y + eye.h + 10, spriteBottom ? spriteBottom + 6 : -Infinity);
  // 屏幕 ASCII(跟随当前 eye 位置)
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const ctx2 = cv.getContext('2d');
  const cam = g.camera; const z = cam.zoom ?? 1;
  const toS = (wx, wy) => [(wx - (cam.x - cv.width / 2 / z)) * z, (wy - (cam.y - cv.height / 2 / z)) * z];
  const winW = 320, winH = 340;   // 世界 px
  const sx0 = eye.cx - winW / 2, sy0 = eye.cy - winH / 2 - 20;
  const [ax] = toS(sx0, 0); const [, ay] = toS(0, sy0);
  const W = Math.round(winW * z), H = Math.round(winH * z);
  const ox = Math.max(0, Math.floor(ax)), oy = Math.max(0, Math.floor(ay));
  const d = ctx2.getImageData(ox, oy, Math.min(W, cv.width - ox), Math.min(H, cv.height - oy)).data;
  const stride = Math.min(W, cv.width - ox);
  const rows = [];
  for (let y = 0; y < Math.min(H, cv.height - oy); y += 3) {
    let row = '';
    for (let x = 0; x < stride; x += 4) {
      const i = (y * stride + x) * 4;
      const [rr, gg, bb, aa] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (aa < 40) { row += ' '; continue; }
      const mx = Math.max(rr, gg, bb);
      if (gg > 130 && gg > rr + 30 && gg > bb + 30) row += 'B';       // 血条绿
      else if (rr > 150 && gg < 110 && bb < 110) row += 'R';          // 红
      else if (mx > 200) row += '#';
      else if (mx < 60) row += '.';
      else row += ':';
    }
    rows.push(String(Math.round(sy0 + y / z)).padStart(5) + '|' + row);
  }
  return {
    geo: {
      boxBottom: Math.round(eye.y + eye.h), spriteBottom: Math.round(spriteBottom),
      barY: Math.round(barY), gapBarToSprite: Math.round(barY - spriteBottom),
    },
    rows,
  };
});
console.log('geo:', JSON.stringify(out.geo));
for (const r of out.rows ?? []) console.log(r);
console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
