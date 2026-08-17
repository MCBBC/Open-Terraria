// 种子 12345 复现探针（用户 debug 报告同世界）：静止态（无风）树冠-树干接缝
// 全列 α 解剖 + 树高相关性（用户报"越高越出现、无风也有细缝"）。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 } });
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
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 400));
// 种子 12345 + 中型（用户世界 4200×1200）
await page.click('.sw-wc-panel input[data-f=seed]');
await page.keyboard.type('12345');
await new Promise(r => setTimeout(r, 200));
// 尺寸选择器：默认小 → 需要中型。尺寸组是 .sw-wc-opt 列表，第 2 个 = 中
const sizeIdx = await page.evaluate(() => {
  const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
  return opts.map((o, i) => o.className.includes('sel') ? i : -1).filter(i => i >= 0)[0];
});
if (sizeIdx !== 1) {
  await page.evaluate(() => {
    const opts = document.querySelectorAll('[data-g=size] .sw-wc-opt');
    opts[1].click();
  });
  await new Promise(r => setTimeout(r, 300));
}
await page.click('[data-act=create]');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 300000 });
await new Promise(r => setTimeout(r, 3000));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { steps: [] };
  try {
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const st = g.world.store;
    const TREE = TILE_BY_KEY['tree'];
    const T = 16;
    out.worldCheck = { w: st.w, h: st.h, seed: g.world.seed, dungeonX: g.world.dungeonX };
    // 玩家旁 ±40 列找树：marker fy>=198 + 干高（向下扫 type=tree 数）
    const trees = [];
    for (let dx = -40; dx <= 40; dx++) {
      const x = 2068 + dx;
      if (x < 5 || x >= st.w - 5) continue;
      for (let y = 4; y < 400; y++) {
        const i = st.idx(x, y);
        if (st.type[i] === TREE && st.frameY[i] >= 198) {
          let h = 0;
          for (let dy = 1; dy < 40; dy++) { if (st.type[st.idx(x, y + dy)] === TREE) h++; else break; }
          const frames = [];
          for (let dy = 1; dy <= h; dy++) frames.push(`${st.frameX[st.idx(x, y + dy)]},${st.frameY[st.idx(x, y + dy)]}`);
          trees.push({ x, y, trunkH: h, fx: st.frameX[i], fy: st.frameY[i], frames });
          break;
        }
      }
    }
    out.trees = trees.map((t) => ({ x: t.x, y: t.y, h: t.trunkH, marker: t.fx + '/' + t.fy, below: t.frames.slice(0, 3).join(' | ') }));
    // 无风：风速归零（视觉摆动幅度→cos 微摆 0.04，等价静止）
    g.world.weather.windSpeedCurrent = 0;
    g.world.weather.windSpeedTarget = 0;
    g.camera.zoom = 1.25;
    const canvas = g.renderer.canvas;
    const ctx = canvas.getContext('2d');
    const z = 1.25;
    const dumpTree = (t) => {
      // 钉相机到该树
      const pin = () => { g.player.x = t.x * T + 8; g.player.y = t.y * T + 4; g.player.vx = 0; g.player.vy = 0; };
      for (let i = 0; i < 60; i++) { pin(); g.fixedUpdate(1 / 60); }
      for (let i = 0; i < 3; i++) { pin(); g.fixedUpdate(1 / 60); }
      // 干列 ±10px、边界行 −6..+10 的 α 矩阵（逐世界像素列采样 1 个 canvas 像素）
      const map = [];
      for (let py = t.y * T - 6; py <= t.y * T + 10; py++) {
        const row = [];
        for (let wx = t.x * T - 10; wx < t.x * T + 12; wx++) {
          const [sx] = g.camera.worldToScreen(wx, 0);
          const sy = g.camera.worldToScreen(0, py)[1];
          const d = ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
          row.push(d[3] > 200 ? '#' : d[3] > 60 ? '+' : d[3] > 10 ? '.' : ' ');
        }
        map.push(String(py - t.y * T).padStart(3) + ' ' + row.join(''));
      }
      return map;
    };
    // 按干高排序取矮/中/高三档
    trees.sort((a, b) => a.trunkH - b.trunkH);
    const picks = [];
    if (trees.length > 0) picks.push(trees[0]);
    if (trees.length > 2) picks.push(trees[Math.floor(trees.length / 2)]);
    if (trees.length > 1) picks.push(trees[trees.length - 1]);
    out.dumps = picks.map((t) => ({ x: t.x, y: t.y, h: t.trunkH, map: dumpTree(t) }));
  } catch (err) { out.steps.push('ERR ' + String(err && err.stack || err).slice(0, 400)); }
  return out;
});
console.log('world:', JSON.stringify(res.worldCheck));
console.log('trees(n=' + (res.trees?.length ?? 0) + '):', JSON.stringify(res.trees?.slice(0, 12)));
for (const d of res.dumps ?? []) {
  console.log(`\n=== 树@(${d.x},${d.y}) 干高=${d.h} 行=边界±(−6..+10) 列=干心±(−10..+11) ===`);
  for (const row of d.map) console.log(row);
}
if (res.steps?.length) console.log(res.steps.join('\n'));
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
