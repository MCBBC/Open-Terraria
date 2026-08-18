// 摆动层差分取证：同机位静止(关摆动) vs 微摆(开摆动) 画布差分 →
// 差分像素的世界坐标聚类（缝行会呈现为交界处的横向条带）。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
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
  await page.keyboard.type('差分');
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
  const { options } = await import('/src/core/options.ts');
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
  const m = markers[0];
  if (!m) { out.err = 'no tree'; return out; }
  out.tree = m;
  const B = (m.y + 1) * T;
  const pin = () => { g.player.x = m.x * T + 8; g.player.y = B - 8; g.player.vx = 0; g.player.vy = 0; };
  g.camera.zoom = 1.25; g.camera.zoomTarget = 1.25;
  g.world.weather.windSpeedCurrent = 0; g.world.weather.windSpeedTarget = 0;
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const grab = async () => {
    await raf(); await raf();
    const camRX = Math.round(g.camera.x * 1.25) / 1.25, camRY = Math.round(g.camera.y * 1.25) / 1.25;
    // 树周 ±6 格 × 交界 ±4 行区域
    const x0 = Math.round((m.x * T - 6 * T - camRX) * 1.25 + canvas.width / 2);
    const y0 = Math.round((B - 4 * T - camRY) * 1.25 + canvas.height / 2);
    const w = Math.round(12 * T * 1.25), h = Math.round(8 * T * 1.25);
    return { d: ctx.getImageData(x0, y0, w, h).data, x0, y0, w, h };
  };
  // 静止（关摆动）
  const prevSway = options.data.swayInWind;
  options.set('swayInWind', false);
  pin(); for (let i = 0; i < 60; i++) { pin(); g.fixedUpdate(1 / 60); }
  const still = await grab();
  // 微摆（开摆动）多帧
  options.set('swayInWind', true);
  const diffs = [];
  for (let f = 0; f < 24; f++) {
    for (let i = 0; i < 2; i++) { pin(); g.fixedUpdate(1 / 60); }
    const s = await grab();
    let n = 0;
    for (let j = 0; j < s.d.length; j += 4) {
      if (Math.abs(s.d[j] - still.d[j]) > 40 || Math.abs(s.d[j + 3] - still.d[j + 3]) > 40) n++;
    }
    diffs.push(n);
  }
  options.set('swayInWind', prevSway);
  // 静止图解剖：交界行 ±3 的 α/亮度行剖面（干带 ±10 设备px）
  const rows = [];
  for (let dy = -3; dy <= 3; dy++) {
    const sy = Math.round((B + dy - Math.round(g.camera.y * 1.25) / 1.25) * 1.25 + canvas.height / 2);
    const sx = Math.round((m.x * T - camRX2(g)) * 1.25 + canvas.width / 2);
    function camRX2(gg) { return Math.round(gg.camera.x * 1.25) / 1.25; }
    const d = ctx.getImageData(sx, sy, Math.round(20 * 1.25), 1).data;
    let bg = 0, n = 0;
    for (let j = 3; j < d.length; j += 4) { n++; if (d[j] < 60) bg++; }
    rows.push({ dy, bg, n });
  }
  out.stillRows = rows;
  out.diffCounts = diffs;
  out.diffMax = Math.max(...diffs);
  return out;
});
console.log(JSON.stringify(res, null, 1).slice(0, 900));
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
