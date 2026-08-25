// 墓碑放置复现：tryPlace 直驱（itemDef 传 {tile:'tombstone_v'} 形状）→
// 检查 ①放置是否成功 ②地板是否被打掉 ③是否生成掉落物 ④监听链后墓碑是否还在
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5219';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 140)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('墓碑');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
}
await new Promise(r => setTimeout(r, 1500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const DUMMY = window.__swTiles['v_378_target_dummy'];
  const WEED3 = window.__swTiles['v_3_forest_short_plants'];
  const WEED74 = window.__swTiles['v_74_jungle_tall_plants'];
  const PUMPKIN = window.__swTiles['v_254_pumpkin_plant'];
  if (!DUMMY || !WEED3) return { fail: 'keys' };
  // 造平地 + 种草：3 短草（下格）+ 74 高草（两格）
  const mk = (sx) => {
    for (let y = sx.y - 5; y <= sx.y; y++) for (let x = sx.x - 1; x < sx.x + 4; x++) st.setTile(x, y, 0);
    for (let x = sx.x - 1; x < sx.x + 4; x++) st.setTile(x, sx.y + 1, 2);
    st.setTile(sx.x, sx.y, WEED3, 0, 0);
    st.setTile(sx.x, sx.y - 1, WEED74, 0, 0);
    st.setTile(sx.x, sx.y - 2, WEED74, 0, 18);
    for (let i = 0; i < 10; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  };
  const spot = { x: Math.floor(g.player.cx / 16) + 4, y: Math.floor(g.player.cy / 16) + 3 };
  mk(spot);
  g.player.x = (spot.x - 2) * 16; g.player.y = (spot.y - 3) * 16;
  for (let i = 0; i < 10; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  // 假人 2×3：点击格 = 左下格 → piece = [spot.y-2, spot.y]
  g.tryPlace(spot.x, spot.y, { key: 'vi_378_target_dummy', tile: 'v_378_target_dummy', placeStyle: 0 });
  for (let i = 0; i < 30; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  const rows = [];
  for (let y = spot.y - 3; y <= spot.y + 1; y++) {
    rows.push([st.get(spot.x, y), st.get(spot.x + 1, y)]);
  }
  const weedLeft = rows.flat().filter((t) => t === WEED3 || t === WEED74 || (PUMPKIN && t === PUMPKIN)).length;
  const dummyCells = rows.flat().filter((t) => t === DUMMY).length;
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  return { DUMMY, rows, weedLeft, dummyCells };
});
console.log(JSON.stringify(res));
await page.screenshot({ path: '/tmp/dummy-grass.png' });
await browser.close();
const ok = res && !res.fail && res.dummyCells === 6 && res.weedLeft === 0;
console.log(ok ? '✅ 假人放置已清草' : '❌ 草未清或假人未放全');
process.exit(ok ? 0 : 1);
