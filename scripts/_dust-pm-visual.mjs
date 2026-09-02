// dust 预乘混合批:实机视觉冒烟 v2(正午地表+尘混合档位,截图对比尘可见性)。
// 用法:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_dust-pm-visual.mjs
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/dust-pm-visual-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.setDefaultTimeout(200000);
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(`${ORIGIN}/debug-line.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 8000));   // 等世界真正开画(splash/加载退场)
const out = await page.evaluate(() => {
  const g = window.__swGame, cam = g.camera, vd = g.vanillaDust, w = g.world;
  // 关掉欢迎弹窗(点「我已知晓」)+ 正午 + 地表锚点
  const btn = [...document.querySelectorAll('button')].find((b) => /我已知晓/.test(b.textContent || ''));
  if (btn) btn.click();
  try { w.clock.timeOfDay = 0.3; } catch { /* ignore */ }
  const surf = w.groundLevel ?? 200;
  const cx = g.player?.x ?? surf * 16, cy0 = (surf - 6) * 16;
  if (g.player) { cam.x = g.player.x; cam.y = g.player.y; } else { cam.x = cx; cam.y = cy0; }
  const put = (n, fn) => { for (let i = 0; i < n; i++) fn(cam.x - 200 + Math.random() * 400, cam.y - 120 + Math.random() * 240); };
  put(60, (x, y) => vd.spawn(x, y, 8, 8, 76, 0, 0, 120));        // a>0 默认档
  put(30, (x, y) => { const d = vd.spawn(x, y, 8, 8, 261); if (d) d.alpha = 200; });
  put(40, (x, y) => vd.spawn(x, y, 8, 8, 6));                     // 全亮 A=25
  put(30, (x, y) => vd.spawn(x, y, 8, 8, 55, 0, 0, 140));
  put(40, (x, y) => vd.spawn(x, y, 8, 8, 182));                   // A=0 加性
  put(40, (x, y) => vd.spawn(x, y, 8, 8, 230));                   // A=0 加性
  put(50, (x, y) => vd.spawn(x, y, 8, 8, 130, 3, 2));             // 拖影族
  put(40, (x, y) => { const d = vd.spawn(x, y, 8, 8, 76, 0, 0, 120); if (d) d.color = { r: 250, g: 120, b: 40, a: 220 }; });
  return { total: [...vd.each(true)].length + [...vd.each(false)].length, surf };
});
await page.mouse.click(639, 644);   // 关掉欢迎弹窗
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const g = window.__swGame, vd = g.vanillaDust, cam = g.camera;
  try { g.world.clock.timeOfDay = 0.4; } catch { /* ignore */ }
  const put = (n, fn) => { for (let i = 0; i < n; i++) fn(cam.x - 200 + Math.random() * 400, cam.y - 120 + Math.random() * 240); };
  put(80, (x, y) => vd.spawn(x, y, 8, 8, 76, 0, 0, 120));
  put(40, (x, y) => vd.spawn(x, y, 8, 8, 6));
  put(40, (x, y) => vd.spawn(x, y, 8, 8, 15));
  put(50, (x, y) => vd.spawn(x, y, 8, 8, 130, 3, 2));
  put(40, (x, y) => { const d = vd.spawn(x, y, 8, 8, 76, 0, 0, 120); if (d) d.color = { r: 250, g: 120, b: 40, a: 220 }; });
});
const stats = await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const c2 = document.createElement('canvas'); c2.width = 320; c2.height = 200;
  const x2 = c2.getContext('2d', { willReadFrequently: true });
  x2.drawImage(cv, 0, 0, 320, 200);
  const d = x2.getImageData(0, 0, 320, 200).data;
  let bright = 0, set = new Set();
  for (let i = 0; i < d.length; i += 4) { if (d[i] + d[i + 1] + d[i + 2] > 90) bright++; set.add((d[i] >> 4) + ',' + (d[i + 1] >> 4)); }
  return { brightPx: bright, distinctColors: set.size };
});
await page.screenshot({ path: '/tmp/dust-pm-visual2.png' });
console.log('[视觉冒烟v2]', JSON.stringify(out), JSON.stringify(stats));
await browser.close();
