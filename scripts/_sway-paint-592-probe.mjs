// 验证:①592 吊火盆=加算 glow 绘制 ②油漆摆动件(灯笼)染色生效
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const st = g.world.store;
  const DIRT = window.__swTileByKey('v_2_dirt') ?? 1;
  const LANT = window.__swTileByKey('lantern');
  const BRZ = window.__swTileByKey('v_592_hanging_brazier');
  const tx = Math.floor(pl.cx / 16) + 4;
  const ty = Math.floor((pl.y + pl.h) / 16) + 4;
  for (let x = tx - 8; x <= tx + 10; x++) {
    for (let y = ty - 8; y < ty; y++) st.setTile(x, y, 0);
    st.setTile(x, ty, DIRT);
    st.setTile(x, ty - 8, DIRT);
  }
  // 灯笼(42)在左,吊火盆(592)在右;592 是 2×3
  st.setTile(tx - 2, ty - 7, LANT, 0, 0);
  st.setTile(tx - 2, ty - 6, LANT, 0, 18);
  for (let cy = 0; cy < 3; cy++)
    for (let cx = 0; cx < 2; cx++)
      st.setTile(tx + 2 + cx, ty - 7 + cy, BRZ, cx * 18, cy * 18);
  // 灯笼涂漆(红漆 paint=3?)——直接写 paint 字节(渲染路径验证)
  st.paint[st.idx(tx - 2, ty - 7)] = 3;
  st.paint[st.idx(tx - 2, ty - 6)] = 3;
  await new Promise((r) => setTimeout(r, 500));
  // 相机对准
  pl.x = (tx - 1) * 16; pl.y = (ty - 1) * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1200));
  return { ok: true, lant: [tx - 2, ty - 7], brz: [tx + 2, ty - 7] };
});
if (!out.ok) { console.log(JSON.stringify(out)); process.exit(1); }
await page.screenshot({ path: '/tmp/sway-paint-592.png' });
console.log(JSON.stringify(out));
await browser.close();
