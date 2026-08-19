// 验证 debug-line.html:启动→生成→现场还原→模拟标注→读回坐标。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dbgline-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(420000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swGame, { timeout: 400000 });
await new Promise((r) => setTimeout(r, 6000));
const state = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const edge = [];
  for (let x = 363; x <= 370; x++) {
    const i = st.idx(x, 241);
    edge.push(`${x}:lq${st.liquid[i]}${st.slope[i] ? 's' + st.slope[i] : ''}${st.half[i] ? 'H' : ''}`);
  }
  return { name: g.world.name, player: [g.player.x, g.player.y], zoom: g.camera.zoom,
    time: g.world.clock?.timeOfDay, god: g.player.debugGod, edge241: edge.join(' ') };
});
console.log('[现场]', JSON.stringify(state));
// 模拟点击两个标注:屏幕中心偏左(≈水面)红标 + 下方 Shift 蓝标
await page.mouse.move(756, 300);
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(756, 300);
await page.keyboard.down('Shift');
await page.mouse.click(760, 320);
await page.keyboard.up('Shift');
await new Promise((r) => setTimeout(r, 500));
const marks = await page.evaluate(() => JSON.stringify(window.__debugLineMarks));
console.log('[标注]', marks);
// 视觉回路:覆盖层红像素应出现在点击位置±14px 内
const vis = await page.evaluate(() => {
  const cvs = [...document.querySelectorAll('canvas')].filter((c) => c.style.zIndex === '9999')[0];
  const cx = cvs.getContext('2d');
  const d = cx.getImageData(0, 0, cvs.width, cvs.height).data;
  const dpr = cvs.width / innerWidth;
  let hit = 0, first = null;
  for (let y = 0; y < cvs.height; y += 2) for (let x = 0; x < cvs.width; x += 2) {
    const i = (y * cvs.width + x) * 4;
    if (d[i + 3] > 100 && d[i] > 180 && d[i + 1] < 120) {
      hit++;
      if (!first) first = [x / dpr, y / dpr];
    }
  }
  return { hit, first, dpr: +dpr.toFixed(2) };
});
console.log('[红像素]', JSON.stringify(vis), '点击(756,300) → first 应在 ±14px');
const shot = 'ok';
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/8405c930/tmp/debugline-check.png' });
console.log('[截图]', shot);
await browser.close();
