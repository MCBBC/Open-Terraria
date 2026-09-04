// 入水水花（dust 33 湿溅花）实机定谳探针（2026-09-04 用户实报"水花太大+透明边缘变黑"）。
// 方法：小世界找海面 → 正午 → 在水面上方按 wetSplashStep 原参数撒 10×d33 →
// 截帧 + 读回 droplet 状态/所在格光照/waterStyle/主画布像素 → 判"暗十字"来源
// （预乘烘焙挡天 vs 光照乘色 vs 水前景罩）。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5206') + '/?play=small', { waitUntil: 'domcontentloaded' });
// 私有实例 SW 缓存冷 → 首载走资源预载门;node 侧轮询(每次 evaluate 短平快,防 CDP 长阻塞)
for (let i = 0; i < 110; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const s = await page.evaluate(() => ({
    g: !!(window.__swGame && window.__swGame.player),
    gate: !!document.querySelector('.sw-asset-gate'),
    menu: !!document.querySelector('.sw-title-menu'),
  }));
  if (s.g) break;
  if (i % 6 === 5) console.log('WAIT=' + JSON.stringify(s));
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const st = g.world.store;
  const out = {};

  // ---- 正午 + 找海面（地表附近 liquid>0 且上方为空气的列）----
  out.timeOfDayBefore = g.world.timeOfDay;
  // 关欢迎弹窗（若在）+ 正午
  document.querySelector('.sw-intro-confirm, [class*=intro] button, .sw-modal button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.querySelectorAll('button').forEach((b) => { if (/我已知晓/.test(b.textContent ?? '')) b.click(); });
  // 昼夜双写（World.timeOfDay 与 world.clock 可能异体,光照/天空读哪个都归正午）
  g.world.timeOfDay = 0.5;
  if (g.world.clock) g.world.clock.timeOfDay = 0.5;
  await new Promise((r) => setTimeout(r, 400));
  let spot = null;
  for (let x = 40; x < st.w - 40 && !spot; x += 7) {
    for (let y = 20; y < 620; y++) {
      if (st.liquid[st.idx(x, y)] > 0 && !st.liquid[st.idx(x, y - 1)] && !st.type[st.idx(x, y - 1)] && !st.type[st.idx(x, y - 2)] && !st.type[st.idx(x, y - 3)]) {
        // 要海面:向右连续 24 列同为表层水（小水坑/林间池跳过）
        let span = 0;
        for (let k = 0; k < 12; k++) {
          if (st.liquid[st.idx(x + k, y)] > 0 && !st.type[st.idx(x + k, y - 1)]) span++;
        }
        if (span >= 12) { spot = { x: x + 6, y }; break; }
      }
    }
  }
  out.spot = spot;
  if (!spot) return out;
  out.waterStyle = g.world.waterStyle ?? g.renderer?.waterStyle ?? null;
  // 玩家悬到海面上方 3 格
  g.player.x = spot.x * 16 - g.player.w / 2;
  g.player.y = (spot.y - 3) * 16 - g.player.h / 2;
  g.player.vy = 0;
  await wait(700);   // 相机跟随

  // ---- 按 wetSplashStep 原参数撒 10×d33（Projectile.cs:16994-17004 同式）----
  const boxX = spot.x * 16 - 6, boxY = spot.y * 16 - 8;
  for (let n = 0; n < 10; n++) {
    const d = g.spawnDust(boxX, boxY, 18, 24, 33);
    if (d) { d.vy -= 4; d.vx *= 2.5; d.scale = 1.3; d.alpha = 100; d.noGravity = true; }
  }
  // 15 tick（α 100→130,num≈0.49 中寿）后采样
  for (let i = 0; i < 15; i++) g.fixedUpdate(1 / 60);

  const dusts = [];
  for (const d of g.vanillaDust.each?.(false) ?? []) {
    if (d.active && d.type === 33) dusts.push({ x: +d.x.toFixed(1), y: +d.y.toFixed(1), alpha: d.alpha, scale: +d.scale.toFixed(2), vx: +d.vx.toFixed(2), vy: +d.vy.toFixed(2), fx: d.fx, fy: d.fy });
  }
  out.dusts = dusts.slice(0, 12);
  const mid = dusts[Math.floor(dusts.length / 2)];
  if (mid) {
    out.lightAtDust = g.lighting ? g.lighting.lightAt(Math.floor(mid.x / 16), Math.floor(mid.y / 16)) : null;
    out.lightAtSky = g.lighting ? g.lighting.lightAt(Math.floor(mid.x / 16), Math.floor(mid.y / 16) - 4) : null;
  }
  out.renderPath = {
    glWorldLight: !!g.renderer.worldLightLayer?.(),
    worldLayerEnabled: g.renderer.worldLayerEnabled,
  };
  out.zoom = g.camera.zoom;
  out.playerScreen = g.camera.worldToScreen(spot.x * 16, spot.y * 16);
  window.__splashSpot = spot;
  return out;
});
console.log('STATE=' + JSON.stringify(out));

// 升空相快照（spawn 后 ~15-35 tick = 液滴仍在空中越顶）+ 晚期相
fs.mkdirSync('/tmp/splash', { recursive: true });
await new Promise(r => setTimeout(r, 90));
await page.screenshot({ path: '/tmp/splash/air.png' });
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: '/tmp/splash/late.png' });

// 读回主画布在水花域的像素（跨 droplet 位置方形采样）
const px = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = document.querySelector('canvas');
  const cx = cv.getContext('2d');
  const spot = window.__splashSpot;
  const [sx, sy] = g.camera.worldToScreen(spot.x * 16, (spot.y - 2) * 16);
  const reg = cx.getImageData(Math.max(0, sx - 120), Math.max(0, sy - 200), 240, 260);
  // 非天/非水色的暗像素统计（暗十字应显著）
  const dark = [], bright = [];
  for (let i = 0; i < reg.data.length; i += 4) {
    const r = reg.data[i], gg = reg.data[i + 1], b = reg.data[i + 2];
    if (r + gg + b < 330) dark.push([r, gg, b]);
    else bright.push([r, gg, b]);
  }
  const avg = (a) => a.length ? [0, 1, 2].map(k => Math.round(a.reduce((s, p) => s + p[k], 0) / a.length)) : null;
  return { darkAvg: avg(dark), darkN: dark.length, brightAvg: avg(bright), brightN: bright.length };
});
console.log('PIXELS=' + JSON.stringify(px));
if (errs.length) console.log('ERRS=' + JSON.stringify(errs.slice(0, 6)));
await browser.close();
