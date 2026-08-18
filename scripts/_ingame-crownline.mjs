// 树冠-干交界严格检测（修复前基线/修复后对比共用）：
// 干带 ±10px × 行 [B−2, B+2]，统计背景像素（α<60）与亮背景像素数——
// 冠底边缘行被最近邻丢弃时这些计数会显著升高。30 帧 × 多树 × zoom1.27 × 相位矩阵。
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
  await page.keyboard.type('冠线');
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
  const out = {};
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const T = 16;
  const TREE = TILE_BY_KEY['tree'];
  const ptx = Math.floor(g.player.cx / T);
  const markers = [];
  for (let dx = -100; dx <= 100; dx++) {
    const x = ptx + dx;
    if (x < 5 || x >= st.w - 5) continue;
    for (let y = 4; y < st.h - 5; y++) {
      const i = st.idx(x, y);
      if (st.type[i] === TREE && st.frameY[i] >= 198 && (st.frameX[i] === 22 || st.frameX[i] === 0)) { markers.push({ x, y }); break; }
    }
  }
  g.camera.zoom = 1.27; g.camera.zoomTarget = 1.27;
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  const z = 1.27;
  const raf = () => new Promise(r => requestAnimationFrame(r));
  g.world.weather.windSpeedCurrent = 0; g.world.weather.windSpeedTarget = 0;
  const trees = [];
  for (const m of markers.slice(0, 6)) {
    const B = (m.y + 1) * T;
    const pin = (k) => {
      const o = [[0, 0], [0.3, 0.6], [0.7, 0.2], [0.5, 0.5], [0.1, 0.9], [0.9, 0.1]][k % 6];
      g.player.x = m.x * T + 8 + o[0]; g.player.y = B - 8 + o[1];
      g.player.vx = 0; g.player.vy = 0;
    };
    pin(0);
    for (let i = 0; i < 60; i++) { pin(0); g.fixedUpdate(1 / 60); }
    let worstBg = 0, worstRow = null, framesWithBg = 0;
    for (let f = 0; f < 30; f++) {
      for (let i = 0; i < 2; i++) { pin(f); g.fixedUpdate(1 / 60); }
      await raf(); await raf();
      const camRX = Math.round(g.camera.x * z) / z, camRY = Math.round(g.camera.y * z) / z;
      for (let dy = -2; dy <= 2; dy++) {
        const sx = Math.round((m.x * T - 0 - camRX) * z + canvas.width / 2);
        const sy = Math.round((B + dy - camRY) * z + canvas.height / 2);
        if (sx < 0 || sy < 0 || sx + Math.round(20 * z) >= canvas.width || sy >= canvas.height) continue;
        const d = ctx.getImageData(sx, sy, Math.round(20 * z), 1).data;
        let bg = 0;
        for (let j = 3; j < d.length; j += 4) if (d[j] < 60) bg++;
        if (bg > worstBg) { worstBg = bg; worstRow = dy; }
      }
      if (worstBg > 0) framesWithBg++;
    }
    trees.push({ x: m.x, y: m.y, worstBg, worstRow, framesWithBg });
  }
  return { n: markers.length, trees };
});
console.log('树数:', res.n);
let maxBg = 0;
for (const t of res.trees) { maxBg = Math.max(maxBg, t.worstBg); console.log(`树@(${t.x},${t.y}) 最大背景px=${t.worstBg} @row${t.worstRow} 有背景帧=${t.framesWithBg}/30`); }
console.log('MAXBG=' + maxBg);
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
