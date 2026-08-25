// 涟漪捕获探针：__swRippleCap 钩子记录每颗涟漪的世界坐标/尺寸/α，
// 对照水面 y 计算环是否穿过水面线。三案例：高落/低落/走入。
// 运行:SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs scripts/_ripple-capture-probe.mjs --timeout=120000
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 800, height: 520 }, protocolTimeout: 300000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 120)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5232', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.x / 16) + 10;
  const gy = Math.floor(g.player.y / 16) + 2;
  for (let x = px - 3; x <= px + 3; x++) {
    for (let y = gy; y <= gy + 3; y++) st.setTile(x, y, 0);
    for (let y = gy + 1; y <= gy + 3; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = 255;
      st.liquidType[i] = 1;
    }
  }
  for (let x = px - 3; x <= px + 3; x++) st.setTile(x, gy + 4, 1);
  for (let y = gy; y <= gy + 4; y++) { st.setTile(px - 4, y, 1); st.setTile(px + 4, y, 1); }
  return { px, gy, surfaceY: (gy + 1) * 16 };
});

const runCase = async (name, dropH, walk) => {
  await page.evaluate(() => { window.__swRippleCap = []; });
  const out = await page.evaluate(async ({ s, dropH, walk }) => {
    const g = window.__swGame;
    g.paused = true;
    g.entities.enemies.length = 0;
    g.player.wetCount = 0;
    g.player.inWater = false;
    g.player.x = s.px * 16 - g.player.w / 2 + 8;
    g.player.y = (s.gy + 1) * 16 - dropH - g.player.h - 1;
    g.player.vx = walk ? 2.2 : 0;
    g.player.vy = 0;
    g.player.fallStartY = null;
    if (walk) g.player.x = (s.px - 4) * 16 - g.player.w - 1;   // 左岸
    let entered = -1;
    for (let t = 0; t < 160; t++) {
      g.fixedUpdate(1 / 60);
      if (g.player.inWater && entered < 0) entered = t;
      if (entered >= 0 && t >= entered + 2) break;
    }
    return { entered, surfaceY: s.surfaceY };
  }, { s: setup, dropH, walk });
  await new Promise((r) => setTimeout(r, 120));   // 涟漪窗(10t)内的渲染帧发生,入捕获
  const cap = await page.evaluate(() => { const c = window.__swRippleCap ?? []; window.__swRippleCap = undefined; return c; });
  console.log(`\n=== ${name}（水面 y=${out.surfaceY}）入水@t${out.entered}，捕获 ${cap.length} 颗 ===`);
  for (const r of cap.slice(0, 14)) {
    const rel = r.y - out.surfaceY;
    const top = rel - r.sy / 2, bot = rel + r.sy / 2;
    console.log(`  y=${r.y}(水面${rel >= 0 ? '+' : ''}${rel}) 环跨[${Math.round(top)},${Math.round(bot)}] 尺寸${r.sx}×${r.sy} α=${r.a}`);
  }
};

await runCase('A 高落入 260px', 260, false);
await runCase('B 低落入 40px', 40, false);
await runCase('C 走入', 0, true);
await browser.close();
