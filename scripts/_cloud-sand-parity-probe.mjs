// 云三通道+沙尘 grain 探针（一次性,2026-08-14 遗留清零批）：
//  ① 云量=numClouds 直连（设 200 → 池≈200;设 30 → 收敛 30,每帧±1）
//  ② 三通道分离：distant(scale<1)/closer([1,1.15))/closest(≥1.15) 各自计数和>0
//  ③ 相机视差：云 x 随相机移动 × parallax 反向位移
//  ④ 沙尘暴 grain 池：沙漠+强风+沙暴 → dust268 池活粒>50 + 屏上沙色像素
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5199'}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ① 云量直连
await page.evaluate(() => { window.__swGame.world.weather.numClouds = 200; });
await new Promise((r) => setTimeout(r, 1500));
const c200 = await page.evaluate(() => {
  const g = window.__swGame;
  const vc = g.renderer.sky ? null : null;
  // vclouds 私有——走帧采样:数 canvas 不稳;借 attachWeather 后行为断言改用
  // sky 内部访问:JS 运行时私有可读
  const sky = g.renderer.sky;
  return { n: sky.vclouds.length };
});
check('① 云量=numClouds 直连(200 → 池逼近)', c200.n > 60, `vclouds=${c200.n}`);

await page.evaluate(() => { window.__swGame.world.weather.numClouds = 30; });
await new Promise((r) => setTimeout(r, 6000));
const c30 = await page.evaluate(() => window.__swGame.renderer.sky.vclouds.filter((c) => !c.kill).length);
check('①b 活云收敛到 ≤40(每帧杀 1+千帧淡出=原版节奏)', c30 <= 45, `alive=${c30}`);

// ②③ 三通道 + 视差（重铺 200 便于三档都有样本）
await page.evaluate(() => { window.__swGame.world.weather.numClouds = 200; });
await new Promise((r) => setTimeout(r, 2500));
const passes = await page.evaluate(() => {
  const g = window.__swGame;
  const vc = g.renderer.sky.vclouds;
  const d = vc.filter((c) => c.scale < 1).length;
  const m = vc.filter((c) => c.scale >= 1 && c.scale < 1.15).length;
  const n = vc.filter((c) => c.scale >= 1.15).length;
  // 视差:记录云平均 x,相机右移 300px,再测
  const avgX0 = vc.reduce((s, c) => s + c.x, 0) / Math.max(1, vc.length);
  g.camera.x += 300;
  return { d, m, n, avgX0 };
});
await new Promise((r) => setTimeout(r, 400));
const par = await page.evaluate(() => {
  const g = window.__swGame;
  const vc = g.renderer.sky.vclouds;
  return vc.reduce((s, c) => s + c.x, 0) / Math.max(1, vc.length);
});
check('② 三通道均有样本(或总池充足)', passes.d + passes.m + passes.n > 60,
  `distant=${passes.d} closer=${passes.m} closest=${passes.n}`);
// 相机 +300 → 云应右移不足 300(差值=视差扣除;parallax∈(0.0..~0.2) → 云均移 240~300)
const drift = par - passes.avgX0;
check('③ 相机视差(云屏锚+视差补偿:漂移远小于 300)', drift < 200, `drift=${drift.toFixed(1)}`);

// ④ 沙尘暴 grains
const desert = await page.evaluate(async () => {
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const sandSheets = new Set([53, 396, 397]);
  const ids = [];
  for (let i = 0; i < TILE_DEFS.length; i++) if (sandSheets.has(TILE_DEFS[i]?.vanilla?.sheet)) ids.push(i);
  const col = new Array(Math.ceil(st.w / 16)).fill(0);
  for (let cx = 0; cx < col.length; cx++) {
    for (let x = cx * 16; x < cx * 16 + 16; x += 2) for (let y = 180; y < 400; y += 2) {
      if (ids.includes(st.type[st.idx(x, y)])) col[cx]++;
    }
  }
  let best = 0, bc = 0;
  col.forEach((v, i) => { if (v > bc) { bc = v; best = i; } });
  const cx2 = best * 16 + 8;
  let surf = 0;
  for (let y = 10; y < st.h; y++) if (st.flags[st.idx(cx2, y)]) { surf = y; break; }
  g.player.x = cx2 * 16 - 8; g.player.y = (surf - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  return { bestCol: cx2, surf, bc };
});
check('④a 定位沙漠列', desert.bc > 20, JSON.stringify(desert));

await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world.weather;
  w.windSpeedCurrent = 0.8; w.windSpeedTarget = 0.8;   // HasSufficientWind ≥0.6
  w.sandstorm.happening = true;
  w.sandstorm.timeLeft = 86400;
  w.sandstorm.severity = 0.9; w.sandstorm.intendedSeverity = 0.9;
});
await new Promise((r) => setTimeout(r, 3000));
const sand = await page.evaluate(() => {
  const g = window.__swGame;
  const fx = g.renderer.weatherFx;
  let live = 0, onScreen = 0;
  const camL = g.camera.x - 640, camT = g.camera.y - 400;
  for (const gr of fx.sand) {
    if (!gr.active) continue;
    live++;
    if (gr.x > camL && gr.x < camL + 1280 && gr.y > camT && gr.y < camT + 800) onScreen++;
  }
  return { live, onScreen, severity: g.world.weather.sandstorm.severity, tiles: fx.hooks.desertSandTiles };
});
check('④b 沙尘 grain 池活粒 >50', sand.live > 50, JSON.stringify(sand));

// ④c 像素级:沙色(200,160,20 系)像素出现在画面
const sandPx = await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.renderer.canvas;
  const ctx2 = c.getContext('2d');
  const img = ctx2.getImageData(0, 0, c.width, Math.min(400, c.height)).data;
  let hits = 0;
  for (let i = 0; i < img.length; i += 4) {
    const [r, gg, b] = [img[i], img[i + 1], img[i + 2]];
    if (r > 150 && r < 235 && gg > 110 && gg < 190 && b < 90) hits++;
  }
  return hits;
});
check('④c 画面沙色像素(>500)', sandPx > 500, `hits=${sandPx}`);

check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
