// BJ274 探针4：二分定位幻影青带来源。
//  A. 基线截图+读带区像素
//  B. 清空条带全部液体数据 → 1s → 读像素（带还在?=非数据源）
//  C. 触碰条带 tile 强制 chunk 重烘焙 → 1s → 读像素（带消失?=烘焙缓存）
//  D. reload 重载世界 → 等待 → 读像素（重现=加载期固定产物）
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const saveText = readFileSync('/tmp/bj274-map.json', 'utf8');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/bj274-chrome-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate((text) => window.__swFlow.loadJson(text), saveText);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 30043; g.player.y = 4678; g.player.vx = 0; g.player.vy = 0;
});
await new Promise((r) => setTimeout(r, 6000));

// 采样函数:条带区 teal 像素统计(world tile 1866-1896, rows 293-296 → 屏 x 649..1129, y 434..502)
const readBand = () => page.evaluate(() => {
  let c = null;
  document.querySelectorAll('canvas').forEach((el) => { if (el.width === 1512 && el.height === 862) c = el; });
  if (!c) return { err: 'no canvas' };
  const ctx = c.getContext('2d');
  const X0 = 650, X1 = 1130, Y0 = 434, Y1 = 502;
  const d = ctx.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data;
  let teal = 0, total = (X1 - X0) * (Y1 - Y0), mint = 0;
  const colHits = new Map();
  for (let y = 0; y < Y1 - Y0; y++) {
    for (let x = 0; x < X1 - X0; x++) {
      const i = (y * (X1 - X0) + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (g > 100 && b > 90 && r < 90) {
        teal++;
        const wx = Math.floor((X0 + x - 756 + 30053) / 16);
        colHits.set(wx, (colHits.get(wx) || 0) + 1);
      }
      if (g > 200 && b > 150 && r > 80 && r < 200) mint++;
    }
  }
  const cols = [...colHits.entries()].filter(([, n]) => n > 6).map(([w, n]) => w).sort((a, b) => a - b);
  return { teal, mint, total, cols };
});

console.log('A baseline:', JSON.stringify(await readBand()));
await page.screenshot({ path: '/tmp/bj274-bisect-A.png' });

// B. 清液体
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  for (let x = 1700; x <= 2000; x++) for (let y = 280; y <= 310; y++) st.setLiquid(x, y, 0, 0);
});
await new Promise((r) => setTimeout(r, 1200));
console.log('B after clearing liquid:', JSON.stringify(await readBand()));
await page.screenshot({ path: '/tmp/bj274-bisect-B.png' });

// C. 触碰 tile 强制重烘焙（重写同类型）
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  for (let x = 1860; x <= 1890; x++) {
    const i = st.idx(x, 295);
    const t = st.type[i];
    st.setTile(x, 295, t, 0);
  }
});
await new Promise((r) => setTimeout(r, 1200));
console.log('C after tile touch (rebake):', JSON.stringify(await readBand()));
await page.screenshot({ path: '/tmp/bj274-bisect-C.png' });
await browser.close();
console.log('done');
