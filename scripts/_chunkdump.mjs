// chunk 画布直读：复现树 (0,44) 件在 chunk tile 层的真实像素
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
  await page.keyboard.type('chunk');
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
  let marker = null;
  for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) {
    const x = 2164 + dx, y = 219 + dy;
    const i = st.idx(x, y);
    if (st.type[i] === TREE && st.frameY[i] >= 198 && st.frameX[i] === 22) marker = { x, y };
  }
  if (!marker) return { err: 'no tree' };
  const B = (marker.y + 1) * T;
  g.camera.zoom = 1.25; g.camera.zoomTarget = 1.25;
  const pin = () => { g.player.x = marker.x * T + 8; g.player.y = B - 8; g.player.vx = 0; g.player.vy = 0; };
  pin();
  for (let i = 0; i < 60; i++) { pin(); g.fixedUpdate(1 / 60); }
  for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
  // chunk 定位：chunkCache（renderer 内部）
  const cache = g.chunks;   // Game.chunks = ChunkCache 实例（Game.ts:2831）
  const chunks = cache.chunks;
  const cx = Math.floor(marker.x / 16), cy = Math.floor((marker.y + 1) / 16);
  const key = cx | (cy << 16);
  const pair = chunks.get(key) ?? chunks.get(cx + ',' + cy);
  if (!pair) return { err: 'no chunk ' + key, keys: [...chunks.keys()].slice(0, 5) };
  const tile = pair.tile;
  const cctx = tile.getContext('2d');
  // chunk 内局部坐标 + 页内 cell 偏移（pair.sx/sy = cell 页内左上）
  const lx = marker.x % 16, ly = (marker.y + 1) % 16;
  const baseX = pair.sx, baseY = pair.sy;
  // 件画在 (lx*16−2, ly*16) 20×20 —— dump 行 0..3 的 alpha
  const dump = [];
  for (let r = -1; r <= 3; r++) {
    const d = cctx.getImageData(baseX + lx * 16 - 2, baseY + ly * 16 + r, 20, 1).data;
    let s = '';
    for (let j = 3; j < d.length; j += 4) s += d[j] > 60 ? '#' : '.';
    dump.push(String(r).padStart(2) + '|' + s);
  }
  // 该行邻格 half 状态
  const halves = [];
  for (let dx = -2; dx <= 2; dx++) {
    const i = st.idx(marker.x + dx, marker.y + 1);
    halves.push(dx + ':h' + (st.half[i] ? 1 : 0) + '/' + st.frameX[i] + ',' + st.frameY[i]);
  }
  // 屏幕全宽行剖析：dy=0/+1 行 dx −48..+48 每 2px 一点，找天空区右边界
  const canvas = g.renderer.canvas;
  const sctx = canvas.getContext('2d');
  const camRY2 = Math.round(g.camera.y * 1.25) / 1.25;
  const camRX2 = Math.round(g.camera.x * 1.25) / 1.25;
  const wide = [];
  for (let dy = 0; dy <= 1; dy++) {
    let line = '';
    const sx = Math.round((marker.x * T + 8 - camRX2) * 1.25 + canvas.width / 2);
    const sy = Math.round((B + dy - camRY2) * 1.25 + canvas.height / 2);
    for (let dx = -48; dx <= 48; dx += 2) {
      const d = sctx.getImageData(sx + Math.round(dx * 1.25), sy, 1, 1).data;
      const l = (d[0] + d[1] + d[2]) / 3;
      const isSky = d[2] > d[0] + 20 && d[2] > 120;
      line += isSky ? '.' : l > 140 ? '-' : l > 80 ? '=' : '#';
    }
    wide.push('dy=' + dy + ' |' + line);
  }
  return { marker, dump, halves, chunkKey: key, canvasSize: [tile.width, tile.height], lx, ly, wide, camY: +g.camera.y.toFixed(3) };
});
if (res.err) { console.log('ERR:', res.err, JSON.stringify(res.keys ?? [])); await browser.close(); process.exit(1); }
console.log('树:', JSON.stringify(res.marker), 'chunk key:', res.chunkKey, '局部', res.lx, res.ly, 'chunk canvas:', res.canvasSize);
console.log('y+1 行邻格:', res.halves.join('  '));
console.log('chunk tile 层 件区 行 −1..+3 的 alpha:');
for (const d of res.dump) console.log(d);
console.log('屏幕行剖析（dx −48..+48 步 2px，.=天空 -=亮 #=暗）:');
for (const w of res.wide) console.log(w);
console.log('camY =', res.camY);
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
