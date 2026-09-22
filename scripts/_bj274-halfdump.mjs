// BJ274 探针5：dump 条带 half/slope 位 + WaterfallRenderer.falls 列表 + 帧内瀑布绘制计数。
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
await page.evaluate((t) => window.__swFlow.loadJson(t), saveText);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => { const g = window.__swGame; g.player.x = 30043; g.player.y = 4678; });
await new Promise((r) => setTimeout(r, 6000));
const out = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  // renderer 实例路径探测
  let rend = null;
  for (const k of Object.keys(g)) {
    try { if (g[k] && g[k].waterfalls) { rend = g[k]; break; } } catch {}
  }
  const falls = rend ? rend.waterfalls.falls.slice(0, 60) : null;
  const fallsCount = rend ? rend.waterfalls.falls.length : -1;
  // half/slope/liquid 表 (x 1830-1930, y 292-297)
  const rows = [];
  for (let y = 292; y <= 297; y++) {
    const cells = [];
    for (let x = 1830; x <= 1930; x++) {
      const i = st.idx(x, y);
      if (st.half[i] || st.slope[i] || st.liquid[i]) cells.push(`${x}:h${st.half[i]}s${st.slope[i]}l${st.liquid[i]}t${st.type[i]}`);
    }
    rows.push({ y, cells });
  }
  return { fallsCount, falls, rows };
});
console.log('falls count:', out.fallsCount);
console.log('falls:', JSON.stringify(out.falls));
for (const r of out.rows) console.log(`row ${r.y}:`, r.cells.join(' '));
await browser.close();
console.log('done');
