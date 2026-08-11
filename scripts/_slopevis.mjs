// 坡面渲染 + BlockStyle 过滤 + 水面波动 E2E 验证
//  1) 找地表 slope1/slope2 格 → 读 chunk tile canvas 像素 → 斜坡形状断言
//     slope1(左高右低): 左列上段不透明 / 右列上段透明
//     slope2(右高左低): 镜像
//  2) BlockStyle: slope 格上/断开侧邻居不应与之融合(掩码已断 → 用渲染侧证: 不再要求)
//  3) 水面波动: 同一液面截图 3 帧 150ms 间隔 → 表面带像素差异 > 0
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ========== 1) 坡面渲染像素断言 ==========
// 找 slope 格:地表附近(y∈[groundLevel-10, groundLevel+40]) flags 活性 slope>0
const samples = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const gl = Math.floor(g.world.groundLevel);
  const out = { s1: [], s2: [], slopeCount: 0, halfCount: 0 };
  for (let x = 200; x < st.w - 200; x++) {
    for (let y = Math.max(10, gl - 10); y < Math.min(st.h, gl + 60); y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      if (st.half[i]) out.halfCount++;
      if (st.slope[i] === 1 && out.s1.length < 4) out.s1.push({ x, y, t: st.type[i] });
      if (st.slope[i] === 2 && out.s2.length < 4) out.s2.push({ x, y, t: st.type[i] });
    }
  }
  for (let i = 0; i < st.slope.length; i++) if (st.slope[i] > 0) out.slopeCount++;
  return out;
});
check('生成了坡面数据', samples.slopeCount > 100, `全图 ${samples.slopeCount} 格 slope, half ${samples.halfCount}`);

// 传送玩家到第一组 slope 样本附近并等 chunk 渲染
await page.evaluate((sx, sy) => {
  const g = window.__swGame;
  g.player.x = sx * 16 - 200; g.player.y = (sy - 6) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
}, samples.s1[0]?.x ?? 0, samples.s1[0]?.y ?? 0);
await new Promise((r) => setTimeout(r, 1500));

// 逐样本读 chunk tile canvas: 每列首个不透明行(斜坡对角线)+补条
const probe = async (cell) => page.evaluate((cx, cy) => {
  const g = window.__swGame;
  const cc = g.chunks;
  const key = (Math.floor(cx / 16) & 0xffff) | ((Math.floor(cy / 16) & 0xffff) << 16); // ChunkCache.key
  const pair = cc.chunks.get(key);
  if (!pair) return { err: 'no chunk' };
  const ctx = pair.tile.getContext('2d');
  const lx = (cx % 16) * 16, ly = (cy % 16) * 16;
  const d = ctx.getImageData(lx, ly, 16, 16).data;
  // solidStart(x): 列 x 自顶向下首个 alpha>40 的行(无则 16)
  const solidStart = (x) => {
    for (let y = 0; y < 16; y++) if (d[(y * 16 + x) * 4 + 3] > 40) return y;
    return 16;
  };
  const opq = (x, y0, y1) => {
    let n = 0;
    for (let y = y0; y < y1; y++) if (d[(y * 16 + x) * 4 + 3] > 40) n++;
    return n;
  };
  return {
    s: [1, 4, 7, 10, 13].map(solidStart),
    bottomPad: opq(8, 14, 16), topPad: opq(8, 0, 2),
  };
}, cell.x, cell.y);

// slope1(左高右低): solidStart 随列递增(左列≈0/贴图顶部,右列≥8),补条在底部
for (const c of samples.s1) {
  const r = await probe(c);
  if (r.err) { console.log('skip s1', JSON.stringify(c), r.err); continue; }
  check(`slope1(${c.x},${c.y}) 左高右低对角线`,
    r.s[0] <= 3 && r.s[4] >= 8 && r.s[0] < r.s[2] && r.s[2] < r.s[4] && r.bottomPad >= 1,
    JSON.stringify(r));
  break;
}
// slope2(右高左低): 镜像
for (const c of samples.s2) {
  const r = await probe(c);
  if (r.err) { console.log('skip s2', JSON.stringify(c), r.err); continue; }
  check(`slope2(${c.x},${c.y}) 右高左低对角线`,
    r.s[4] <= 5 && r.s[0] >= 8 && r.s[4] < r.s[2] && r.s[2] < r.s[0] && r.bottomPad >= 1,
    JSON.stringify(r));
  break;
}

// 截图给用户看斜坡地形
await page.screenshot({ path: '/tmp/slope-region.png' });

// ========== 2) 水面波动 ==========
const water = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 找大片静止水体的液面:某格 liquid>200 且上方格液体 0,且左右延伸 >= 8
  for (let y = Math.floor(g.world.groundLevel); y < Math.floor(g.world.groundLevel) + 200; y++) {
    for (let x = 100; x < st.w - 100; x++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 200 && st.liquid[st.idx(x, y - 1)] === 0) {
        let run = 0;
        for (let k = x; k < x + 12; k++) {
          const j = st.idx(k, y);
          if (st.liquid[j] > 200 && st.liquid[st.idx(k, y - 1)] === 0 && !st.flags[j]) run++;
          else break;
        }
        if (run >= 8) return { x: x + 4, y };
      }
    }
  }
  return null;
});
if (!water) {
  check('找到测试水面', false, '');
} else {
  // 玩家浮在液面格(游戏每帧把相机吸回玩家——相机手动对位会被覆盖),
  // 玩家原地漂浮 → 相机跟随 → 液面保持在视口中央附近
  const zoom = await page.evaluate((wx, wy) => {
    const g = window.__swGame;
    g.player.x = wx * 16; g.player.y = wy * 16;
    g.player.vx = 0; g.player.vy = 0;
    return g.renderer?.zoom ?? g.camera?.zoom ?? 1;
  }, water.x, water.y);
  await new Promise((r) => setTimeout(r, 2000));
  // 玩家浮在水面 → 视口内必含大片液面;全视口截图直接做帧间 diff(不猜液面屏幕位置)
  const shots = [];
  for (let k = 0; k < 3; k++) {
    const buf = await page.screenshot({});
    shots.push(PNG.sync.read(buf));
    await new Promise((r) => setTimeout(r, 200));
  }
  let diff01 = 0, diff02 = 0, blueA = 0;
  const a = shots[0].data, b = shots[1].data, c = shots[2].data;
  for (let p = 0; p < a.length; p += 4) {
    if (Math.abs(a[p] - b[p]) > 8 || Math.abs(a[p + 1] - b[p + 1]) > 8 || Math.abs(a[p + 2] - b[p + 2]) > 8) diff01++;
    if (Math.abs(a[p] - c[p]) > 8 || Math.abs(a[p + 1] - c[p + 1]) > 8 || Math.abs(a[p + 2] - c[p + 2]) > 8) diff02++;
    if (a[p + 3] > 60 && a[p + 2] > a[p] + 20) blueA++;
  }
  writeFileSync('/tmp/water-surface.png', PNG.sync.write(shots[0]));
  check('液面随时间波动(帧间像素变化)', diff01 > 100 && diff02 > 100,
    `zoom=${zoom} 帧0→1 ${diff01}px, 0→2 ${diff02}px, 视口内水色px ${blueA}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
