// 吊挂灯笼叠影复现:搭场(顶棚+灯笼 style0 两格帧)+玩家来回走推动,摆动中截图
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
const setup = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const st = g.world.store;
  const DIRT = window.__swTileByKey('v_2_dirt') ?? 1;
  const LANT = window.__swTileByKey('lantern');
  const tx = Math.floor(pl.cx / 16) + 4;
  const ty = Math.floor((pl.y + pl.h) / 16) + 4;
  // 场地:地面 ty,顶棚 ty-6,灯笼挂顶棚下(tx, ty-5..ty-4) style0(fy 0/18)
  for (let x = tx - 8; x <= tx + 8; x++) {
    for (let y = ty - 5; y < ty; y++) st.setTile(x, y, 0);
    st.setTile(x, ty, DIRT);
    st.setTile(x, ty - 6, DIRT);
  }
  st.setTile(tx, ty - 5, LANT, 0, 0);
  st.setTile(tx, ty - 4, LANT, 0, 18);
  await new Promise((r) => setTimeout(r, 400));
  // 玩家站灯笼旁
  pl.x = (tx - 3) * 16; pl.y = (ty - 1) * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1000));
  return { ok: true, lantern: [tx, ty - 5], lant: LANT, fxc: st.frameX[st.idx(tx, ty - 5)], fyc: st.frameY[st.idx(tx, ty - 5)] };
});
if (!setup.ok) { console.log(JSON.stringify(setup)); process.exit(1); }
// 静止帧
await page.screenshot({ path: '/tmp/lantern-rest.png' });
// 来回走推动 1.2s,摆动中截帧
await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const t0 = performance.now();
  while (performance.now() - t0 < 1200) {
    pl.vx = Math.sin((performance.now() - t0) / 90) * 6;   // 来回走
    pl.x += pl.vx;
    await new Promise((r) => setTimeout(r, 16));
  }
  pl.vx = 0;
});
const mid = await page.evaluate(() => window.__swGame.player.x);
await page.screenshot({ path: '/tmp/lantern-swing.png' });
console.log(JSON.stringify({ ...setup, playerXAfter: mid }));
await browser.close();
