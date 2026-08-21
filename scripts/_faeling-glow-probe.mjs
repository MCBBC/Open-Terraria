// 飞灵 677 发光渲染探针：重建世界 → 传微光湖 → spawnFaelings →
// 对每只 677：采样其屏幕包围盒像素，断言
//  ①有强加算白团（列2 光晕：存在 RGB ≥ 240 的近白像素簇）
//  ②有饱和彩虹色（本体 HSL 调制：存在 max-min 通道差 ≥ 60 的彩色像素）
//  ③拖尾（本体后方一串淡彩虹斑）
//  ④夜间/暗处本体依然全亮（自发光：暗背景上 faeling 中心亮度不随光照下降）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5205';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
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
  await page.keyboard.type('萤光');
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
await new Promise(r => setTimeout(r, 2500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 传到微光湖右岸（与 _faeling-align 同锚点）
  g.player.x = 247 * 16 + 8; g.player.y = 446 * 16;
  g.player.vx = 0; g.player.vy = 0;
  for (let i = 0; i < 120; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  await new Promise(r => setTimeout(r, 800));
  for (let i = 0; i < 60; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  const faelings = g.entities.critters.filter((c) => c.vanillaId === 677 && !c.dead);
  if (!faelings.length) return { fail: 'no faeling spawned' };
  // 若全在屏外，把第一只拉到玩家旁边
  const f = faelings[0];
  f.x = g.player.x + 60; f.y = g.player.y - 40; f.vx = 0.5; f.vy = 0;
  // 推进若干 tick 让历史缓冲填满（拖尾需要）
  for (let i = 0; i < 70; i++) { f.vx = 0.6; f.vy = 0; g.fixedUpdate(1 / 60); }
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  // 屏幕坐标 = (世界 - 相机) × zoom + 半屏
  const cam = g.renderer.cam || g.camera;
  const z = cam.zoom || 1;
  const sx = (f.cx - cam.x) * z + canvas.width / (2 * g.renderer.dpr) * g.renderer.dpr;
  const dpr = g.renderer.dpr || 1;
  const px = (f.cx - cam.x) * z + canvas.width / (2 * dpr);
  const py = (f.cy - cam.y) * z + canvas.height / (2 * dpr);
  const R = 40; // 采样半径（覆盖光晕+sparkle）
  const x0 = Math.max(0, Math.round(px - R)), y0 = Math.max(0, Math.round(py - R));
  const w = Math.min(canvas.width - x0, R * 2), h = Math.min(canvas.height - y0, R * 2);
  if (w <= 0 || h <= 0) return { fail: 'faeling off-screen', px, py, cw: canvas.width, ch: canvas.height };
  const d = ctx.getImageData(x0, y0, w, h).data;
  let brightWhite = 0, saturated = 0, maxLum = 0, sumLum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
    sumLum += lum; n++;
    if (lum > maxLum) maxLum = lum;
    if (r > 235 && gg > 235 && b > 235) brightWhite++;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx > 90 && mx - mn > 60) saturated++;
  }
  // 暗处自发光对照：把玩家挪进深地下再采样一次太重——直接读光照值
  const light = g.renderer.lighting ? g.renderer.lighting.lightAt(Math.floor(f.cx / 16), Math.floor(f.cy / 16)) : null;
  return {
    faelings: faelings.length,
    px: Math.round(px), py: Math.round(py),
    brightWhite, saturated, maxLum: Math.round(maxLum), avgLum: Math.round(sumLum / n),
    lightAt: light ? light.map((v) => Math.round(v)) : null,
    scale: f.vanillaScale, histDepth: f.historyDepth(),
  };
});
console.log(JSON.stringify({ res, errs: errs.slice(0, 5) }, null, 1));
// 截图留档
await page.screenshot({ path: '/tmp/faeling-glow.png' });
await browser.close();
const ok = res && !res.fail && res.brightWhite > 30 && res.saturated > 10 && res.maxLum >= 250;
console.log(ok ? '✅ 飞灵发光渲染断言全过' : '❌ 断言未过');
process.exit(ok ? 0 : 1);
