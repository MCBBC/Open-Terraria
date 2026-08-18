// 指针悬停图标(宝箱)全亮探针:悬停宝箱 → cursorItemIconID 生效 →
// 图标区像素非黑(修复前 source-atop 叠黑 = 纯黑方块)。
// 原版依据:Main.cs:44519 GetItemLight 默认 outInTheWorld=false 不采光照,图标恒全亮。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  // 1) 找一口箱(世界 chests 登记表)
  const chest = g.world.chests?.[0];
  if (!chest) return { err: 'no chest in world' };
  // 2) 传送玩家到箱旁(交互射程内)
  p.x = (chest.x - 1) * 16; p.y = (chest.y - 2) * 16;
  const cam = g.camera;
  // 等相机收敛(传送后平滑跟随需数百 ms;收敛后再取屏幕坐标才有效)
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 50));
    if (Math.abs(cam.x - (p.x + p.w / 2)) < 2 && Math.abs(cam.y - (p.y + p.h / 2)) < 2) break;
  }
  // 3) 鼠标挪到箱中心
  const [sx, sy] = cam.worldToScreen ? cam.worldToScreen(chest.x * 16 + 16, chest.y * 16 + 16)
    : [g.renderer.canvas.width / 2, g.renderer.canvas.height / 2];
  g.input.mouseX = sx; g.input.mouseY = sy;
  await new Promise((r) => setTimeout(r, 400));   // 悬停解析 + 渲染
  const iconId = p.cursorItemIconID;
  // 校验:鼠标 tile 应即箱格
  const [wx2, wy2] = cam.screenToWorld(g.input.mouseX, g.input.mouseY);
  const mouseTile = [Math.floor(wx2 / 16), Math.floor(wy2 / 16)];
  // 4) 图标区像素采样(修复判据:mouse+10 起的 22×22 区有彩色像素,非整片黑)
  const cv = g.renderer.canvas;
  const ctx = cv.getContext('2d');
  const scale = cv.width / cv.getBoundingClientRect().width;
  const ox = Math.round((sx + 10) * scale), oy = Math.round((sy + 10) * scale);
  const S = Math.round(22 * scale);
  const d = ctx.getImageData(ox, oy, S, S).data;
  let colored = 0, black = 0, total = 0;
  for (let i = 0; i < d.length; i += 4) {
    total++;
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r + gg + b > 90) colored++;
    else black++;
  }
  return { err: null, iconId, chestAt: [chest.x, chest.y], mouseTile, colored, black, total };
});
if (res.err) { check('找到宝箱并悬停', false, res.err); }
else {
  check('悬停宝箱 → cursorItemIconID 生效', res.iconId > 0, `iconId=${res.iconId}`);
  const coloredPct = (res.colored / res.total) * 100;
  check('图标区有彩色像素(非纯黑方块)', res.colored > res.total * 0.05, `colored ${res.colored}/${res.total} (${coloredPct.toFixed(1)}%)`);
  check('无页面错误', errors.length === 0, errors.join(' | '));
}
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
