// 视觉验证:加载"新世界",传送到绿砖地牢 (5063,433) 截图 + 像素检测
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });

// 选择存档"新世界"
const picked = await page.evaluate(() => {
  const sel = document.querySelector('select');
  if (!sel) return false;
  const opt = [...sel.options].find(o => /新世界/.test(o.textContent));
  if (!opt) return false;
  sel.value = opt.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
});
console.log('picked world:', picked);
const btn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /开始|进入|加载/.test(x.textContent));
  if (b) { b.click(); return b.textContent; }
  return null;
});
console.log('clicked button:', btn);
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 180000 });
await new Promise(r => setTimeout(r, 3000));

// 传送到地牢入口上方 (书签 x=5063, y=433)
const TELEPORTED = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  p.x = 5063 * 16;
  p.y = (433 - 8) * 16;
  p.vx = 0; p.vy = 0;
  g.camera.x = p.x; g.camera.y = p.y;
  return true;
});
console.log('teleported:', TELEPORTED);
await new Promise(r => setTimeout(r, 4000));

// 确认该处 tile 仍是绿砖
const tileInfo = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const t = st.type[st.idx(5063, 433)];
  return { tileId: t, defKey: g.world ? (st.defByKey ? undefined : undefined) : undefined };
});
console.log('tile at (5063,433):', JSON.stringify(tileInfo));

await page.screenshot({ path: '/tmp/greenbrick-check.png' });

// 像素检测:画面中应存在绿色调(#3E6046 附近)砖块像素
const pixelCheck = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let green = 0, total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    total++;
    const [r, g2, b] = [d[i], d[i + 1], d[i + 2]];
    // 绿砖: G 明显高于 R 和 B,偏灰绿
    if (g2 > r + 10 && g2 > b + 10 && g2 > 40 && g2 < 160 && r < 130) green++;
  }
  return { green, total, ratio: green / Math.max(total, 1) };
});
console.log('pixelCheck:', JSON.stringify(pixelCheck));
console.log('pageerrors:', errs.slice(0, 5));
await browser.close();
