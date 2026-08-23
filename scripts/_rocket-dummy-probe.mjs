// 火箭弹 vs 假人:接触应立即结算伤害(shake+飘值),不再穿体后爆
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
  const tx = Math.floor(pl.cx / 16) + 8;
  const ty = Math.floor((pl.y + pl.h) / 16) + 2;
  for (let x = tx - 12; x <= tx + 12; x++) {
    for (let y = ty - 9; y < ty; y++) st.setTile(x, y, 0);
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
  // 火箭炮+火箭 I(按 vid 直扫 ITEM_DEFS,绕键别名)
  let gun = -1, ammo = -1;
  try {
    const m = await import('/src/data/items.ts');
    for (let i = 0; i < m.ITEM_DEFS.length; i++) {
      const dd = m.ITEM_DEFS[i];
      const vid = dd?.vid ?? -1;
      if (vid === 752) gun = i;
      if (vid === 771) ammo = i;
    }
  } catch { /* noop */ }
  if (gun < 0 || ammo < 0) return { err: 'items not found', gun, ammo };
  pl.inv.slots[pl.inv.selected] = { id: gun, stack: 1 };
  pl.inv.slots[54] = { id: ammo, stack: 99 };
  g.cb.onInventoryChanged();
  pl.x = d.cx - 140 - pl.w / 2; pl.y = d.cy - pl.h / 2; pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1200));
  const [mx, my] = g.camera.worldToScreen(d.cx, d.cy);
  g.input.mouseX = mx; g.input.mouseY = my;
  // 飘值计数
  let nums = 0;
  const orig = g.addDamageNumber.bind(g);
  g.addDamageNumber = (...a) => { nums++; return orig(...a); };
  g.input.mouseDown = true;
  let exploded = false, contactShake = 0;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 40));
    if (d.dummyShake > 0) contactShake = d.dummyShake;
    if (!(g.entities.projectiles || []).some((p) => !p.dead && p.constructor.name === 'GrenadeProj')) { exploded = true; break; }
  }
  g.input.mouseDown = false;
  g.addDamageNumber = orig;
  return { hit: contactShake > 0, shake: contactShake, dmgNumbers: nums, exploded };
});
console.log(JSON.stringify(out));
await browser.close();
