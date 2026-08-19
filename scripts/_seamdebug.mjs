// 活体调试：复现树上直接取证——干件帧、交界行 RGB、chunk 画布内容、
// 冠 overlay 位置，四路同帧取证定位天空行来源。
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
  await page.keyboard.type('缝调');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
// 上轮世界在旧浏览器 profile（每次 launch 新 profile）——重建：种子 12345 小世界
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
await page.waitForFunction(() => window.__swGame?.player, { timeout: 300000 });
await new Promise(r => setTimeout(r, 2500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const T = 16, TREE = TILE_BY_KEY['tree'];
  let marker = null;
  for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) {
    const x = 2164 + dx, y = 219 + dy;
    const i = st.idx(x, y);
    if (st.type[i] === TREE && st.frameY[i] >= 198 && st.frameX[i] === 22) marker = { x, y };
  }
  if (!marker) return { err: 'no tree' };
  const B = (marker.y + 1) * T;
  g.camera.zoom = 1.25; g.camera.zoomTarget = 1.25;
  g.world.weather.windSpeedCurrent = 0; g.world.weather.windSpeedTarget = 0;
  const pin = () => { g.player.x = marker.x * T + 8; g.player.y = B - 8; g.player.vx = 0; g.player.vy = 0; };
  pin();
  for (let i = 0; i < 60; i++) { pin(); g.fixedUpdate(1 / 60); }
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  const camY = g.camera.y;
  const camRY = Math.round(camY * 1.25) / 1.25;
  const camRX = Math.round(g.camera.x * 1.25) / 1.25;
  // ① 干件帧
  const frames = [];
  for (let dy = 0; dy <= 3; dy++) {
    const i = st.idx(marker.x, marker.y + dy);
    frames.push(st.frameX[i] + ',' + st.frameY[i] + (st.flags[i] ? '' : '!') + ' h' + (st.half[i] ? 1 : 0) + ' s' + st.slope[i] + ' w' + st.wall[i]);
  }
  // ② 交界行 RGB（行 −2..+2 × 干心±10）
  const rows = [];
  for (let dy = -2; dy <= 2; dy++) {
    const sx = Math.round((marker.x * T - camRX) * 1.25 + canvas.width / 2);
    const sy = Math.round((B + dy - camRY) * 1.25 + canvas.height / 2);
    const rgb = [];
    for (let dx = -10; dx <= 10; dx += 5) {
      const d = ctx.getImageData(Math.round(sx + dx * 1.25), sy, 1, 1).data;
      rgb.push(d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3]);
    }
    rows.push({ dy, rgb });
  }
  // ③ 逐行扫描：从 B−8 到 B+8 找首行"树干色"（R>G>B 棕色系）
  const scan = [];
  for (let dy = -8; dy <= 8; dy++) {
    const sx = Math.round((marker.x * T - camRX) * 1.25 + canvas.width / 2);
    const sy = Math.round((B + dy - camRY) * 1.25 + canvas.height / 2);
    if (sy < 0 || sy >= canvas.height) continue;
    const d = ctx.getImageData(sx, sy, Math.round(12 * 1.25), 1).data;
    let bark = 0, sky = 0, n = 0;
    for (let j = 0; j < d.length; j += 4) {
      n++;
      if (d[j] > d[j + 2] + 15 && d[j] < 200) bark++;
      if (d[j + 2] > d[j] + 20 && d[j + 2] > 120) sky++;
    }
    scan.push({ dy, bark: +(bark / n).toFixed(2), sky: +(sky / n).toFixed(2) });
  }
  return { marker, B, camY: +camY.toFixed(3), frames, rows, scan };
});
if (res.err) { console.log('ERR:', res.err); await browser.close(); process.exit(1); }
console.log('复现树:', JSON.stringify(res.marker), 'B =', res.B, 'camY =', res.camY);
console.log('干件帧(y..y+3):', res.frames.join(' | '));
console.log('交界行 RGB（dx −10,−5,0,5,10）:');
for (const r of res.rows) console.log(' dy=' + String(r.dy).padStart(2) + ': ' + r.rgb.join('  '));
console.log('逐行 bark/sky 比（dy −8..+8）:');
for (const s of res.scan) console.log(' dy=' + String(s.dy).padStart(3) + ' bark=' + s.bark + ' sky=' + s.sky);
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
