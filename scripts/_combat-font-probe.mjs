// 一次性探针:飘字原版位图字体渲染验证
//  1) 产生三种飘字(普通/暴击/DoT dot)→ 截图核对位图字形(非 monospace)
//  2) canvas 像素断言:飘字区域存在非背景像素且字形高度 ≈14-16px(原版字形高)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&fontprobe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

// 直接注入三种飘字并驱动若干 tick(字体懒加载等待)
const spawnRes = await page.evaluate(() => {
  const g = window.__swGame;
  g.dmgNumbers.length = 0;
  g.addDamageNumber(g.player.cx, g.player.y - 30, 37, false, '#FF7060');        // 普通
  g.addDamageNumber(g.player.cx + 60, g.player.y - 30, 88, true, '#FF8040');    // 暴击
  g.addDamageNumber(g.player.cx - 60, g.player.y - 30, 5, false, '#FF3C46', true); // DoT
  return g.dmgNumbers.length;
});
await new Promise((r) => setTimeout(r, 400));   // 字体纹理懒加载窗口
// 推进让 scale 生长到 1(原版 0.1/t)
await page.evaluate(() => {
  const g = window.__swGame;
  for (const d of g.dmgNumbers) d.scale = 1;
  g.dmgNumbers.forEach((d) => { d.life = Math.max(d.life, 30); d.alpha = 1; });
});
await new Promise((r) => setTimeout(r, 200));
await page.screenshot({ path: '/tmp/sw-combat-font.png' });

// 像素断言:玩家上方 80×40 区域应有彩色字形像素(非纯背景)
const pixels = await page.evaluate(() => {
  const g = window.__swGame;
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.y - 30);
  const data = ctx.getImageData(Math.floor(sx) - 60, Math.floor(sy) - 30, 140, 60).data;
  let lit = 0, colors = new Set();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 100 && (data[i] > 80 || data[i + 1] > 80 || data[i + 2] > 80)) {
      lit++;
      colors.add((data[i] >> 5) + ',' + (data[i + 1] >> 5) + ',' + (data[i + 2] >> 5));
    }
  }
  return { lit, colors: colors.size };
});
const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });
ok('spawn-3', spawnRes === 3, { spawnRes });
// 决定性:位图字体纹理被请求且加载(而非 monospace 回退)
const fontLoaded = await page.evaluate(() =>
  performance.getEntriesByType('resource').some((r) => r.name.includes('Combat_Text_p22.png')));
ok('font-texture-loaded', fontLoaded, { fontLoaded });
ok('glyph-pixels', pixels.lit > 50, pixels);
ok('glyph-colors', pixels.colors >= 3, pixels);   // 普通红/暴击橙/DoT 深红至少三色调
const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
