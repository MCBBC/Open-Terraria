// 假人视觉验证 v3:直调 hurt() 触发受击,三帧截图(静止/受击后仰/回落)
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
  const tx = Math.floor(pl.cx / 16) + 4;
  const ty = Math.floor((pl.y + pl.h) / 16) + 2;
  for (let x = tx - 10; x <= tx + 10; x++) {
    for (let y = ty - 8; y < ty; y++) st.setTile(x, y, 0);
    st.setTile(x, ty, DIRT);
  }
  const T378 = window.__swTileByKey('v_378_target_dummy');
  // 全 6 格帧(2 宽×3 高,18px 步进;锚=左上 frameX0/frameY0)——模拟真实施放
  for (let cy2 = 0; cy2 < 3; cy2++)
    for (let cx2 = 0; cx2 < 2; cx2++)
      st.setTile(tx + cx2, ty - 1 + cy2, T378, { frameX: cx2 * 18, frameY: cy2 * 18 });
  g['spawnDummyAt'](tx, ty - 1);
  await new Promise((r) => setTimeout(r, 600));
  const d = (g.entities.enemies || []).find((n) => !n.dead && n.vanillaId === 488);
  if (!d) return { err: 'no dummy' };
  window.__dummy = d;
  // 相机对准假人(玩家移到旁边)
  pl.x = d.cx - 100 - pl.w / 2; pl.y = d.cy - pl.h / 2; pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1200));
  return { ok: true, anchor: [tx, ty - 1] };
});
if (!setup.ok) { console.log(JSON.stringify(setup)); process.exit(1); }
// 静止帧
await page.screenshot({ path: '/tmp/dummy-rest.png' });
// 受击(shake=24 → 后仰帧 6,持续 ~400ms)
await page.evaluate(() => { window.__dummy.hurt(30, 1, 0, window.__swGame); });
await new Promise((r) => setTimeout(r, 80));
const mid = await page.evaluate(() => window.__dummy.dummyShake);
await page.screenshot({ path: '/tmp/dummy-hit.png' });
// 半程(后仰回落中)
await new Promise((r) => setTimeout(r, 150));
await page.screenshot({ path: '/tmp/dummy-mid.png' });
await new Promise((r) => setTimeout(r, 900));
const end = await page.evaluate(() => window.__dummy.dummyShake);
await page.screenshot({ path: '/tmp/dummy-after.png' });
console.log(JSON.stringify({ ...setup, midShake: mid, endShake: end }));
await browser.close();
