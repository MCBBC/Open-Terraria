// 小地图扫入误开图探针（2026-08-25 用户报：连发武器按住左键开火时准星扫进
// 小地图矩形 → 全屏地图被误开）。断言：
//   A1 按住扫入小地图本体不开图（原版 UI 点击=按下边沿 Main.cs:52706）
//   A2 松手后原地真实点击仍开图（回归）
//   A3 Escape 关图（回归）
//   A4 标注模式同款边沿门：按住扫过新格不落标；原地点击才落标
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&btn=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2500));

const rect = await page.evaluate(() => JSON.parse(JSON.stringify(window.__swGame.renderer.minimapRect)));
if (!rect || rect.w <= 0) { console.error('minimapRect 未就绪'); process.exit(1); }
const mx = Math.round(rect.x + rect.w / 2), my = Math.round(rect.y + rect.h / 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- A1：按住左键（世界区起手）→ 扫入小地图中心 → 保持按住 → 不开图 ----
await page.mouse.move(320, 420);
await sleep(150);
await page.mouse.down();
await sleep(600);                       // ≥20 帧：_prevMouseDown 快照已置位
for (let i = 1; i <= 12; i++) {         // 分步扫入（模拟连续移动准星）
  await page.mouse.move(320 + ((mx - 320) * i) / 12, 420 + ((my - 420) * i) / 12);
  await sleep(40);
}
await sleep(700);                       // 悬在小地图上继续按住
const fmDuringSweep = await page.evaluate(() => window.__swGame.renderer.fullMap.open);
await page.mouse.up();
await sleep(400);

// ---- A2：松手后原地真实点击 → 开图 ----
await page.mouse.move(mx, my);
await sleep(150);
await page.mouse.down(); await sleep(120); await page.mouse.up();
await sleep(600);
const fmAfterClick = await page.evaluate(() => window.__swGame.renderer.fullMap.open);

// ---- A3：Escape 关图（回归） ----
await page.keyboard.press('Escape');
await sleep(400);
const fmAfterEsc = await page.evaluate(() => window.__swGame.renderer.fullMap.open);

// ---- A4：标注模式边沿门（判别场景=按住中途才开标注模式=模拟"扫入"：
//      边沿已在关模式时消费,旧电平门会在新格误标） ----
await page.evaluate(() => { const g = window.__swGame; g.annotateMode = false; g.marks = []; });
await page.mouse.move(320, 460);
await sleep(150);
await page.mouse.down();
await sleep(500);                        // 按住状态下打开标注模式
for (let i = 1; i <= 8; i++) { await page.mouse.move(320 + (i * 160) / 8, 460 + (i * 20) / 8); await sleep(30); }
await sleep(100);
await page.evaluate(() => { window.__swGame.annotateMode = true; });
await sleep(400);
await page.mouse.up();
await sleep(300);
const marksAfterSweep = await page.evaluate(() => window.__swGame.marks.length);
await page.mouse.move(560, 500);
await sleep(150);
await page.mouse.down(); await sleep(120); await page.mouse.up();
await sleep(300);
const marksAfterClick = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.marks.length;
  g.annotateMode = false; g.marks = [];   // 清场
  return n;
});

console.log(JSON.stringify({
  rect, mx, my,
  A1_sweepOpensMap: !!fmDuringSweep,     // 期望 false
  A2_clickOpensMap: !!fmAfterClick,      // 期望 true
  A3_escClosesMap: !fmAfterEsc,          // 期望 true
  A4_marksAfterSweep: marksAfterSweep,   // 期望 0
  A4_marksAfterClick: marksAfterClick,   // 期望 1
  errors: errors.slice(0, 3),
}, null, 2));
await browser.close();
