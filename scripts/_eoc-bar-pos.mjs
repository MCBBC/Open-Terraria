// 一次性验证:EoC 头顶血条 vs 眼球贴图的相对位置(屏幕像素实测)
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
  g.world.clock.timeOfDay = 0.9;
  g.debugSpawnNpc(4, 1, false);
  await new Promise((r) => setTimeout(r, 4000));
  const eye = g.entities.all().filter((e) => e.vanillaId === 4).pop();
  if (!eye) return { err: 'no eye' };
  eye.hurt(500, 0, 0, g);   // 打掉血 → 血条出现
  // 夜间全黑:围绕眼球插火把照明(血条/贴图都吃光照 alpha)
  const st = g.world.store; const torch = window.__swTiles['torch'];
  for (const [dx, dy] of [[-140, -160], [140, -160], [-140, 60], [140, 60], [0, -220]]) {
    const px = Math.floor((eye.cx + dx) / 16), py = Math.floor((eye.cy + dy) / 16);
    if (st.inBounds(px, py) && !st.flags[st.idx(px, py)]) st.setTileSilent(px, py, torch, 0, 0);
  }
  await new Promise((r) => setTimeout(r, 5000));
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const ctx2 = cv.getContext('2d');
  const cam = g.camera; const z = cam.zoom ?? 1;
  const toS = (wx, wy) => [(wx - (cam.x - cv.width / 2 / z)) * z, (wy - (cam.y - cv.height / 2 / z)) * z];
  // 眼球周围 260×260 世界px 窗口:逐行扫描
  const [x0s] = toS(eye.cx - 130, 0);
  const [, y0s] = toS(0, eye.cy - 200);
  const W = Math.round(260 * z), H = Math.round(300 * z);
  const sx = Math.max(0, Math.floor(x0s)), sy = Math.max(0, Math.floor(y0s));
  const d = ctx2.getImageData(sx, sy, Math.min(W, cv.width - sx), Math.min(H, cv.height - sy)).data;
  const rows = [];
  for (let y = 0; y < Math.min(H, cv.height - sy); y += 2) {
    let row = '';
    for (let x = 0; x < Math.min(W, cv.width - sx); x += 4) {
      const i = ((y * Math.min(W, cv.width - sx)) + x) * 4;
      const [rr, gg, bb, aa] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (aa < 40) { row += ' '; continue; }
      const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
      if (gg > 150 && rr < 120 && gg > bb) row += 'B';          // 血条绿
      else if (rr > 180 && gg < 120 && bb < 120) row += 'R';    // 红(眼白血管/血条红)
      else if (mx > 180) row += '#';
      else if (mx < 70) row += '.';
      else row += ':';
    }
    rows.push(String(Math.round(y / z + (eye.cy - 200))).padStart(5) + '|' + row);
  }
  // 盒底屏幕 y(世界 → 屏幕)
  const [, boxBottomS] = toS(0, eye.y + eye.h);
  const [, boxTopS] = toS(0, eye.y);
  return { ascii: rows, boxTopWorld: Math.round(eye.y), boxBottomWorld: Math.round(eye.y + eye.h), cyWorld: Math.round(eye.cy), boxTopScreen: Math.round(boxTopS - sy), boxBottomScreen: Math.round(boxBottomS - sy), imgH: cv.height };
});
for (const r of out.ascii ?? []) console.log(r);
console.log('boxTopScreen=' + out.boxTopScreen + ' boxBottomScreen=' + out.boxBottomScreen + ' (窗口内像素坐标,窗口高=' + out.imgH + ')');
console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
