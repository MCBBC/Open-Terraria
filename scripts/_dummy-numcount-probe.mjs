// 假人单次命中飘值计数:手工子弹命中,钩 addDamageNumber 计数(应=1)
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
  const tx = Math.floor(pl.cx / 16) + 6;
  const ty = Math.floor((pl.y + pl.h) / 16) + 2;
  for (let x = tx - 10; x <= tx + 10; x++) {
    for (let y = ty - 8; y < ty; y++) st.setTile(x, y, 0);
    st.setTile(x, ty, DIRT);
  }
  const T378 = window.__swTileByKey('v_378_target_dummy');
  for (let cy = 0; cy < 3; cy++)
    for (let cx = 0; cx < 2; cx++)
      st.setTile(tx + cx, ty - 1 + cy, T378, cx * 18, cy * 18);
  g['spawnDummyAt'](tx, ty - 1);
  await new Promise((r) => setTimeout(r, 600));
  const d = (g.entities.enemies || []).find((n) => !n.dead && n.vanillaId === 488);
  if (!d) return { err: 'no dummy' };
  // 钩飘值计数
  let count = 0;
  const orig = g.addDamageNumber.bind(g);
  g.addDamageNumber = (...a) => { count++; return orig(...a); };
  // 手工子弹扫过命中盒
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const p = new Arrow(d.cx - 120, d.cy - 2, 4, 0, 25, 2, 14, null, { grav: 0 });
  g.entities.add(p, 'projectiles');
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 16));
    if (d.dummyShake > 0 || p.dead) break;
  }
  g.addDamageNumber = orig;
  return { hit: d.dummyShake > 0, shake: d.dummyShake, dmgNumbers: count };
});
console.log(JSON.stringify(out));
await browser.close();
