// 种子 12345 中型世界（用户 debug 报告同世界）树冠-干接缝静止态复现探针：
// ① g.newWorld 直建（UI 尺寸选择不可靠）②用户视角截图 ③真冠标记逐树 α 解剖。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
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
  await page.keyboard.type('树诊');
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
  // 用户世界=小型 4200×1200（面板默认选中"中"——显式点"小"）
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    (opts.find((o) => o.textContent.includes('小')) ?? opts[0]).click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.player, { timeout: 300000 });
await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 3000));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { steps: [] };
  try {
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const st = g.world.store;
    const TREE = TILE_BY_KEY['tree'];
    const T = 16;
    out.worldCheck = { w: st.w, h: st.h, dungeonX: g.world.dungeonX, spawnX: g.world.spawnX };
    // 用户位置 ±50 列收真冠标记（fx 22/0）
    const trees = [];
    for (let dx = -50; dx <= 50; dx++) {
      const x = 2068 + dx;
      if (x < 5 || x >= st.w - 5) continue;
      for (let y = 4; y < 420; y++) {
        const i = st.idx(x, y);
        if (st.type[i] === TREE && (st.frameX[i] === 22 || st.frameX[i] === 0) && st.frameY[i] >= 198) {
          let h = 0;
          for (let dy = 1; dy < 40; dy++) { if (st.type[st.idx(x, y + dy)] === TREE) h++; else break; }
          const below = [];
          for (let dy = 1; dy <= Math.min(h, 3); dy++) below.push(`${st.frameX[st.idx(x, y + dy)]},${st.frameY[st.idx(x, y + dy)]}`);
          trees.push({ x, y, h, marker: st.frameX[i] + '/' + st.frameY[i], below: below.join(' | ') });
          break;
        }
      }
    }
    out.trees = trees;
    // 无风
    g.world.weather.windSpeedCurrent = 0;
    g.world.weather.windSpeedTarget = 0;
    g.camera.zoom = 1.25;
    const canvas = g.renderer.canvas;
    const ctx = canvas.getContext('2d');
    out.canvasSize = [canvas.width, canvas.height];
    const raf = () => new Promise(r => requestAnimationFrame(r));
    const dumpTree = async (t) => {
      const pin = () => { g.player.x = t.x * T + 8; g.player.y = t.y * T + 4; g.player.vx = 0; g.player.vy = 0; };
      for (let i = 0; i < 70; i++) { pin(); g.fixedUpdate(1 / 60); }
      for (let i = 0; i < 4; i++) { pin(); g.fixedUpdate(1 / 60); }
      await raf(); await raf();
      const map = [];
      for (let py = t.y * T - 8; py <= t.y * T + 18; py++) {
        const row = [];
        for (let wx = t.x * T - 14; wx < t.x * T + 16; wx++) {
          const sx = Math.round(g.camera.worldToScreen(wx, 0)[0]);
          const sy = Math.round(g.camera.worldToScreen(0, py)[1]);
          if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) { row.push('?'); continue; }
          const d = ctx.getImageData(sx, sy, 1, 1).data;
          row.push(d[3] > 200 ? '#' : d[3] > 60 ? '+' : d[3] > 10 ? '.' : ' ');
        }
        map.push(String(py - t.y * T).padStart(3) + '|' + row.join(''));
      }
      return map;
    };
    out.dumps = [];
    for (const t of trees.slice(0, 3)) {
      out.dumps.push({ t, map: await dumpTree(t) });
    }
    // 用户视角截图
    g.player.x = 2068 * T + 8; g.player.y = 232 * T + 8; g.player.vx = 0; g.player.vy = 0;
    for (let i = 0; i < 80; i++) g.fixedUpdate(1 / 60);
    for (let i = 0; i < 10; i++) await raf();
  } catch (err) { out.steps.push('ERR ' + String(err && err.stack || err).slice(0, 400)); }
  return out;
});
console.log('world:', JSON.stringify(res.worldCheck), 'canvas:', JSON.stringify(res.canvasSize));
console.log('trees(n=' + (res.trees?.length ?? 0) + '):');
for (const t of res.trees ?? []) console.log(`  @(${t.x},${t.y}) h=${t.h} marker=${t.marker} below=[${t.below}]`);
for (const d of res.dumps ?? []) {
  console.log(`\n=== 树@(${d.t.x},${d.t.y}) h=${d.t.h} 行=marker底±(−8..+18) 列=干心±(−14..+15) ===`);
  for (const row of d.map) console.log(row);
}
if (res.steps?.length) console.log(res.steps.join('\n'));
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await page.screenshot({ path: '/tmp/sw-user-view.png' });
await browser.close();
