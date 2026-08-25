// 氙奇葩水池实证:载入世界→传送到 (2076,231)→dump 周边液体+截图
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
// 世界清单
const worlds = await page.evaluate(() => {
  const s = document.querySelector('select');
  return Array.from(s.options).map((o, i) => ({ i, text: o.text }));
});
console.log('WORLD LIST:', JSON.stringify(worlds));
const xen = worlds.find((w) => w.text.includes('氙奇葩'));
const idx = xen ? xen.i : 0;
console.log('picking index', idx, xen ? '(氙奇葩)' : '(fallback first)');
await page.evaluate((i) => { const s = document.querySelector('select'); s.selectedIndex = i; s.parentElement.querySelector('button').click(); }, idx);
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });
// 传送到 (2076,231)
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  p.x = 2076 * 16 - p.w / 2; p.y = 228 * 16;
  g.camera.x = p.cx; g.camera.y = p.cy;
  // 周边液体扫描 ±40
  const st = g.world.store;
  const liq = [];
  for (let y = 231 - 40; y <= 231 + 40; y++) {
    for (let x = 2076 - 40; x <= 2076 + 40; x++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (st.liquid[i] > 0) liq.push({ x, y, amt: st.liquid[i], type: st.liquidType[i] });
    }
  }
  // 玩家脚下/身边采样
  const samples = [];
  for (const [dx, dy] of [[0, -1], [0, 0], [4, 0], [-4, 0], [8, -2], [12, -2]]) {
    const i = st.idx(2076 + dx, 231 + dy);
    samples.push({ x: 2076 + dx, y: 231 + dy, type: st.type[i], liq: st.liquid[i], lt: st.liquidType[i] });
  }
  return { liquidCount: liq.length, liqSample: liq.slice(0, 10), samples, worldName: g.world.name };
});
console.log(JSON.stringify(out, null, 1));
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: '/tmp/pool-shot.png' });
console.log('saved /tmp/pool-shot.png');
process.exit(0);
