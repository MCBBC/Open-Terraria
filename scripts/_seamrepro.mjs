// 种子 12345 小世界（=报告世界）复现树 (2164,219) 交界缝：
// 相机 y 亚像素相位 × 风况 扫描，检测交界行天空像素。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 } });
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
  await page.keyboard.type('缝复现');
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
  await page.click('.sw-wc-panel input[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    (opts.find((o) => o.textContent.includes('小')) ?? opts[0]).click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 3000));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const T = 16, TREE = TILE_BY_KEY['tree'];
  // 找 (2164,219)±5 的树（同种子同尺寸世界应同布局）
  let marker = null;
  for (let dx = -6; dx <= 6; dx++) {
    const x = 2164 + dx;
    for (let dy = -6; dy <= 6; dy++) {
      const y = 219 + dy;
      const i = st.idx(x, y);
      if (st.type[i] === TREE && st.frameY[i] >= 198 && st.frameX[i] === 22) {
        marker = { x, y, fx: st.frameX[i], fy: st.frameY[i] };
      }
    }
  }
  if (!marker) return { err: 'no tree near (2164,219)' };
  const B = (marker.y + 1) * T;
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  const raf = () => new Promise(r => requestAnimationFrame(r));
  g.camera.zoom = 1.25; g.camera.zoomTarget = 1.25;
  // 天空色采样：树上方 40px 处一行（同帧同光照）
  const out = [];
  const windModes = [
    { w: 0, n: '无风' },
    { w: 0.35, n: '微风' },
  ];
  for (const wm of windModes) {
    g.world.weather.windSpeedCurrent = wm.w;
    g.world.weather.windSpeedTarget = wm.w;
    // 相机 y 相位 0.00-1.24 步 0.1（玩家 y 偏移驱动相机）
    for (let py = 0; py < 1.3; py += 0.1) {
      const pin = () => {
        g.player.x = marker.x * T + 8;
        g.player.y = B - 8 - py;   // 相机中心上偏 py → 相机 y 相位变化
        g.player.vx = 0; g.player.vy = 0;
      };
      pin();
      for (let i = 0; i < 50; i++) { pin(); g.fixedUpdate(1 / 60); }
      for (let f = 0; f < 4; f++) {
        pin();
        for (let i = 0; i < 3; i++) g.fixedUpdate(1 / 60);
        await raf(); await raf();
        const camY = g.camera.y;
        const camRY = Math.round(camY * 1.25) / 1.25;
        const camRX = Math.round(g.camera.x * 1.25) / 1.25;
        // 交界行 ±1：干心±8 世界px
        for (let dy = -1; dy <= 1; dy++) {
          const sx = Math.round((marker.x * T - camRX) * 1.25 + canvas.width / 2);
          const sy = Math.round((B + dy - camRY) * 1.25 + canvas.height / 2);
          if (sx < 0 || sy < 0 || sx + 10 >= canvas.width || sy >= canvas.height) continue;
          const d = ctx.getImageData(sx, sy, 10, 1).data;
          let skyLike = 0, n = 0;
          for (let j = 0; j < d.length; j += 4) {
            n++;
            // 天空特征：B > R 且 B > G 且亮度较高（本帧白天）
            if (d[j + 2] > d[j] + 20 && d[j + 2] > d[j + 1] + 10 && d[j + 2] > 120) skyLike++;
          }
          if (skyLike / n > 0.5) out.push({ wind: wm.n, py: +py.toFixed(1), dy, skyRatio: +(skyLike / n).toFixed(2), camY: +camY.toFixed(3) });
        }
      }
    }
  }
  return { marker, out, canvasSize: [canvas.width, canvas.height] };
});
if (res.err) { console.log('ERR:', res.err); await browser.close(); process.exit(1); }
console.log('复现树:', JSON.stringify(res.marker), 'canvas:', res.canvasSize);
if (!res.out.length) console.log('✅ 全相位 × 风况：交界行无天空像素');
else {
  console.log('⚠️ 天空行命中', res.out.length, '例（前 12）:');
  for (const o of res.out.slice(0, 12)) console.log(JSON.stringify(o));
}
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
