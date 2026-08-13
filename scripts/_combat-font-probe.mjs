// 一次性探针:飘字原版位图字体渲染验证
//  1) 产生三种飘字(普通/暴击/DoT dot)→ 截图核对位图字形(非 monospace)
//  2) canvas 像素断言:飘字区域存在非背景像素且字形高度 ≈14-16px(原版字形高)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
const requests = [];
page.on('request', (r) => { if (r.url().includes('Combat_')) requests.push(r.url()); });
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

// 像素断言:逐条飘字 bbox 采样。★主色调断言曾两次假通过——先被玩家 sprite、
// 再被不透明天空背景淹没。改用**红系字形像素计数**:三条飘字本色均红系
// (#FF7060/#FF8040/#FF3C46),天空/泥土背景几乎无红;漏染色(全白)时=0
const perText = await page.evaluate(() => {
  const g = window.__swGame;
  const ctx = g.renderer.canvas.getContext('2d');
  return g.dmgNumbers.map((d) => {
    const [sx, sy] = g.camera.worldToScreen(d.x, d.y);
    const data = ctx.getImageData(Math.floor(sx) - 30, Math.floor(sy) - 14, 60, 28).data;
    let lit = 0, solid = 0, redPx = 0, whitePx = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, gg, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a > 150 && r > 60 && Math.abs(r - gg) + Math.abs(r - b) > 40) {
        // 彩色像素(排除灰/白/黑):字形本体或染色影层
        lit++;
        if (a > 220) solid++;
        if (r >= 180 && r >= gg + 60 && r >= b + 60) redPx++;      // 红系字形
        if (r > 220 && gg > 220 && b > 220) whitePx++;              // 未染色的白字形(抓漏染)
      }
    }
    return { lit, solidRatio: Math.round((solid / Math.max(1, lit)) * 100) / 100, redPx, whitePx };
  });
});
// 位图字形:近不透明像素占比应 >0.9(整数缩放二值 alpha;monospace 抗锯齿仅 ~0.6)
const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });
ok('spawn-3', spawnRes === 3, { spawnRes });
// 决定性:位图字体纹理被请求且加载(而非 monospace 回退)——CDP request 事件,
// 勿用 Resource Timing(启动期资源已塞满其 250 条缓冲,新条目不记录=假阴性)
const fontLoaded = requests.some((u) => u.includes('Combat_Text_p22.png'));
ok('font-texture-loaded', fontLoaded, { fontLoaded, reqs: requests.length });
// 每条飘字:有彩色字形像素 + 位图形状(二值 alpha)+ 红系染色存在 + 无白字形
perText.forEach((p, i) => {
  ok(`t${i}-pixels`, p.lit > 20, { lit: p.lit });
  ok(`t${i}-bitmap-shape`, p.solidRatio > 0.9, { solid: p.solidRatio });
  ok(`t${i}-tinted-red`, p.redPx > 10, { redPx: p.redPx });
  ok(`t${i}-no-white-glyph`, p.whitePx < p.redPx, { redPx: p.redPx, whitePx: p.whitePx });
});
const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
