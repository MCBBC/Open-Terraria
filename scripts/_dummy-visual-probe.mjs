// 假人视觉三帧验证:静止/受击中(后仰帧)/回落——单贴图、单朝向、受击帧正确
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
const state = await page.evaluate(async () => {
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
  st.setTile(tx, ty - 1, T378);
  g['spawnDummyAt'](tx, ty - 1);
  await new Promise((r) => setTimeout(r, 600));
  const d = (g.entities.enemies || []).find((n) => !n.dead && n.vanillaId === 488);
  if (!d) return { err: 'no dummy' };
  // 玩家站旁边持枪
  const idOf = (re) => { const k = Object.keys(window.__swItems).find((k) => re.test(k)); return k ? window.__swItems[k] : -1; };
  const shotgun = idOf(/^vi_534_/) >= 0 ? idOf(/^vi_534_/) : idOf(/^vi_575_/);
  // 弹药按 ammoId===97 直扫(绕开 __swItems 键别名污染:vi_97_* 多键同指 393 墙物)
  let bullet = -1;
  try {
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const d = ITEM_DEFS[i];
      const vid = d?.vid ?? (d?.key ? Number(String(d.key).match(/^vi_(\d+)_/)?.[1] ?? -1) : -1);
      if (d?.ammoId === 97 || vid === 97) { bullet = i; break; }
    }
  } catch { bullet = -1; }
  pl.inv.slots[pl.inv.selected] = { id: shotgun, stack: 1 };
  pl.inv.slots[54] = { id: bullet, stack: 999 };
  g.cb.onInventoryChanged();
  pl.x = d.cx - 110 - pl.w / 2; pl.y = d.cy - pl.h / 2; pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1200));
  const [mx, my] = g.camera.worldToScreen(d.cx, d.cy);
  g.input.mouseX = mx; g.input.mouseY = my;
  return { anchor: [tx, ty - 1], shake: d.dummyShake, mx, my };
});
if (state.err) { console.log(JSON.stringify(state)); process.exit(1); }
// 静止帧
await page.screenshot({ path: '/tmp/dummy-rest.png' });
// 射一发,摇晃中截帧
await page.evaluate(() => { window.__swGame.input.mouseDown = true; });
await new Promise((r) => setTimeout(r, 450));
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
let mid = { shake: 0 };
for (let i = 0; i < 20; i++) {   // 等弹到位(飞行~230ms)+捕捉摇晃窗(~400ms)
  await new Promise((r) => setTimeout(r, 50));
  mid = await page.evaluate(() => { const d = window.__swGame.entities.enemies.find((n) => n.vanillaId === 488); return { shake: d.dummyShake }; });
  if (mid.shake > 0) break;
}
await page.screenshot({ path: '/tmp/dummy-hit.png' });
// 回落完
await new Promise((r) => setTimeout(r, 1200));
const end = await page.evaluate(() => { const d = window.__swGame.entities.enemies.find((n) => n.vanillaId === 488); return { shake: d.dummyShake }; });
await page.screenshot({ path: '/tmp/dummy-after.png' });
console.log(JSON.stringify({ ...state, mid, end }));
await browser.close();
