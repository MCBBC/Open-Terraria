// 夜间冠缘稳定性验证：夜+风0.35，冠底边缘行逐帧变化计数（吸附后应≈0）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('夜缘');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.player, { timeout: 300000 });
await new Promise(r => setTimeout(r, 2500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const T = 16, TREE = TILE_BY_KEY['tree'];
  const ptx = Math.floor(g.player.cx / T);
  const markers = [];
  for (let dx = -80; dx <= 80; dx++) {
    const x = ptx + dx;
    if (x < 5 || x >= st.w - 5) continue;
    for (let y = 4; y < st.h - 5; y++) {
      const i = st.idx(x, y);
      if (st.type[i] === TREE && st.frameY[i] >= 198 && (st.frameX[i] === 22 || st.frameX[i] === 0)) { markers.push({ x, y }); break; }
    }
  }
  // 夜 + 风 0.35（用户场景）
  g.world.clock.timeOfDay = 0;
  g.world.weather.windSpeedCurrent = 0.35;
  g.world.weather.windSpeedTarget = 0.35;
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const out = [];
  for (const m of markers.slice(0, 4)) {
    const B = (m.y + 1) * T;
    const pin = (k) => {
      const o = [[0, 0], [0.3, 0.6], [0.7, 0.2], [0.5, 0.5]][k % 4];
      g.player.x = m.x * T + 8 + o[0]; g.player.y = B - 8 + o[1];
      g.player.vx = 0; g.player.vy = 0;
    };
    pin(0);
    for (let i = 0; i < 60; i++) { pin(0); g.fixedUpdate(1 / 60); }
    for (const z of [1.25, 1.27]) {
      g.camera.zoom = z; g.camera.zoomTarget = z;
      pin(0);
      for (let i = 0; i < 20; i++) { pin(0); g.fixedUpdate(1 / 60); }
      // 干带（±8 世界px）行 B−2..B+3 的全透明行检测（缝=透明行）
      let badFrames = 0, worstRow = null;
      const frames = 30;
      for (let f = 0; f < frames; f++) {
        for (let i = 0; i < 2; i++) { pin(f); g.fixedUpdate(1 / 60); }
        await raf(); await raf();
        const camRX = Math.round(g.camera.x * z) / z, camRY = Math.round(g.camera.y * z) / z;
        for (let dy = -2; dy <= 3; dy++) {
          const sx = Math.round((m.x * T - camRX) * z + canvas.width / 2);
          const sy = Math.round((B + dy - camRY) * z + canvas.height / 2);
          if (sx < 0 || sy < 0 || sx + Math.round(16 * z) >= canvas.width || sy >= canvas.height) continue;
          const d = ctx.getImageData(sx, sy, Math.round(16 * z), 1).data;
          let op = 0, n = 0;
          for (let j = 3; j < d.length; j += 4) { n++; if (d[j] > 60) op++; }
          if (op / n === 0) { badFrames++; if (!worstRow) worstRow = dy; break; }
        }
      }
      out.push({ x: m.x, y: m.y, z, badFrames, worstRow, frames });
    }
  }
  return out;
});
let worst = 0;
for (const r of res) { worst = Math.max(worst, r.badFrames); console.log(`树@(${r.x},${r.y}) ×${r.z}: 透明行坏帧 ${r.badFrames}/${r.frames}` + (r.worstRow !== null ? ' 行' + r.worstRow : '')); }
console.log(worst === 0 ? '✅ 夜间+0.35风 干带零透明行（吸附+下压密封生效）' : '⚠️ 仍有透明行帧');
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
