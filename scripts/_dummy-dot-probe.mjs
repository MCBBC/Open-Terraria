// 假人 DOT 飘值验证:点燃假人 → 钩 addDamageNumber 采样 dot 标记
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
  for (let x = tx - 8; x <= tx + 8; x++) {
    for (let y = ty - 6; y < ty; y++) st.setTile(x, y, 0);
    st.setTile(x, ty, DIRT);
  }
  const T378 = window.__swTileByKey('v_378_target_dummy');
  for (let cy = 0; cy < 3; cy++)
    for (let cx = 0; cx < 2; cx++)
      st.setTile(tx + cx, ty - 3 + cy, T378, cx * 18, cy * 18);
  g['spawnDummyAt'](tx, ty - 3);
  await new Promise((r) => setTimeout(r, 600));
  const d = (g.entities.enemies || []).find((n) => !n.dead && n.vanillaId === 488);
  if (!d) return { err: 'no dummy' };
  let dotNums = 0, total = 0, sampleColor = '';
  const orig = g.addDamageNumber.bind(g);
  g.addDamageNumber = (x, y, n, crit, color, dot) => {
    total++;
    if (dot) { dotNums++; sampleColor = color; }
    return orig(x, y, n, crit, color, dot);
  };
  d.onFireT = 180;   // 点燃 3s
  await new Promise((r) => setTimeout(r, 2500));
  g.addDamageNumber = orig;
  return { dotNums, total, sampleColor, shake: d.dummyShake, alive: !d.dead };
});
console.log(JSON.stringify(out));
await browser.close();
