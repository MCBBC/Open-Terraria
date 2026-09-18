// 2026-09-19 用户实报"地狱背景远景动画停播"探针（一次性诊断）：
//   修复面 = Renderer underground 相位 biomeBg.draw dt 0→16.7（08-20 事故）。
//   证据链 = ①页内直读 renderer.biomeBg.hellFrameT/magmaFrameT 双采样（时钟推进）
//            ②远景区域两帧截图像素差（目视+计数）
// 运行：SW_ORIGIN=http://localhost:5244 node tools/run-diag.mjs scripts/_hell-bg-anim-probe.mjs
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[PROBE]')) console.log(t); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 180000 });
// 等游戏实例就绪（amber-visual-close 同款轮询）
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
// 4200×1200 世界（标准小档,探针惯用）:UnderworldLayer = h-200 = 1000 格
console.log('[run-diag-out] step: gen world 4200x1200');
await page.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
console.log('[run-diag-out] step: player ready');
let worldReady = false;
for (let i = 0; i < 150 && !worldReady; i++) {
  worldReady = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
  if (!worldReady) await new Promise((r) => setTimeout(r, 2000));
}
if (!worldReady) { console.error('世界未就绪'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

// 传送地狱：找开阔 cavern（40×30 盒内实心最少+落脚列无液体）让远景背景主导画面
const tp = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const h = st.h, w = st.w;
  let best = { solid: Infinity, cx: Math.floor(w / 2), cy: h - 140 };
  for (let x = 600; x < w - 600; x += 24) {
    let solid = 0;
    for (let dx = -20; dx <= 20; dx += 2) {
      for (let dy = -16; dy <= 14; dy += 2) {
        if (st.isSolid(x + dx, h - 150 + dy)) solid++;
      }
    }
    if (solid < best.solid) {
      let cy = -1;
      for (let y = h - 130; y > h - 210; y--) {
        if (st.isSolid(x, y) && g.world.liquidAt(x * 16, (y - 1) * 16) === 0) { cy = y; break; }
      }
      if (cy > 0) best = { solid, cx: x, cy };
    }
  }
  g.player.x = best.cx * 16 + 8; g.player.y = (best.cy - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.player.maxHp = 999999; g.player.hp = 999999; g.player.dead = false;
  return { ...best, h };
});
await new Promise((r) => setTimeout(r, 1600));   // 相机落位

// ① 动画钟双采样（ hellFrameT = 远景 Underworld 8fps 钟；magmaFrameT = 岩浆 3 帧钟）
const clocks = await page.evaluate(async () => {
  const bb = window.__swGame.renderer.biomeBg;
  const read = () => ({
    hellFrameT: bb.hellFrameT, magmaFrameT: bb.magmaFrameT, bgTick: bb.bgTick,
    hellFrame: Math.floor(bb.hellFrameT / 1000 * 8) % 4,
    camY: window.__swGame.renderer.camera?.y ?? window.__swGame.player.y,
    uwGate: null,
  });
  const a = read();
  await new Promise((r2) => setTimeout(r2, 900));
  const b = read();
  return { a, b };
});

// ② 远景区两帧截图（中右域避开热栏/血条;先摘欢迎 toast）
await page.evaluate(() => {
  document.getElementById('sw-welcome-announce')?.remove();
  const kill = [];
  for (const el of document.querySelectorAll('div,section')) {
    if (el.textContent?.includes('欢迎来到 SandboxWorld') && el.children.length < 8) kill.push(el);
  }
  for (const el of kill) el.style.display = 'none';
});
await page.screenshot({ path: '/tmp/hellbg-t0.png', clip: { x: 420, y: 110, width: 900, height: 420 } });
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: '/tmp/hellbg-t1.png', clip: { x: 420, y: 110, width: 900, height: 420 } });

const diff = await page.evaluate(async () => {
  const src = window.__swGame.renderer.canvas;
  const c1 = document.createElement('canvas'); c1.width = src.width; c1.height = src.height;
  const c2 = document.createElement('canvas'); c2.width = src.width; c2.height = src.height;
  const x1 = c1.getContext('2d'), x2 = c2.getContext('2d');
  // 两帧画布快照间隔 ~700ms
  x1.drawImage(src, 0, 0);
  await new Promise((r2) => setTimeout(r2, 700));
  x2.drawImage(src, 0, 0);
  const d1 = x1.getImageData(0, 0, Math.min(c1.width, 1400), Math.min(c1.height, 500)).data;
  const d2 = x2.getImageData(0, 0, Math.min(c2.width, 1400), Math.min(c2.height, 500)).data;
  let changed = 0;
  for (let i = 0; i < d1.length; i += 4) {
    if (Math.abs(d1[i] - d2[i]) > 8 || Math.abs(d1[i + 1] - d2[i + 1]) > 8 || Math.abs(d1[i + 2] - d2[i + 2]) > 8) changed++;
  }
  return { changedPx: changed, sampled: d1.length / 4 };
});

console.log('TP:', JSON.stringify(tp));
console.log('CLOCKS:', JSON.stringify(clocks, null, 1));
console.log('DIFF:', JSON.stringify(diff));
const dh = clocks.b.hellFrameT - clocks.a.hellFrameT;
const dm = clocks.b.magmaFrameT - clocks.a.magmaFrameT;
console.log('VERDICT:', dh > 600 && dm > 600 && diff.changedPx > 50
  ? `PASS — hellFrameT +${dh.toFixed(1)}ms(帧 ${clocks.a.hellFrame}→${clocks.b.hellFrame}) magmaFrameT +${dm.toFixed(1)}ms 远景区 ${diff.changedPx}px 变化`
  : `FAIL — hellFrameT +${dh.toFixed(1)}ms magmaFrameT +${dm.toFixed(1)}ms changedPx=${diff.changedPx}`);
await browser.close();
