// 火箭弹 vs 假人:接触应立即结算伤害(shake+飘值),不再穿体后爆
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 200)); });
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
  // 锚=顶左,假人 2×3 向下延伸:站上平台须锚 ty-3(曾 ty-1=下半埋进平台,火箭
  // 沿平台行飞到假人前 1 格土块贴墙爆=探针伪影)
  for (let cy = 0; cy < 3; cy++)
    for (let cx = 0; cx < 2; cx++)
      st.setTile(tx + cx, ty - 3 + cy, T378, cx * 18, cy * 18);
  g['spawnDummyAt'](tx, ty - 3);
  await new Promise((r) => setTimeout(r, 600));
  const d = (g.entities.enemies || []).find((n) => !n.dead && n.vanillaId === 488);
  if (!d) return { err: 'no dummy' };
  // 火箭炮+火箭 I(按 vid 直扫 ITEM_DEFS,绕键别名)
  let gun = -1, ammo = -1, gunKey = '?', ammoKey = '?';
  try {
    const m = await import('/src/data/items.ts');
    const ic = await import('/src/data/vanillaItemCombat.ts');
    const vidOf = (d) => d?.vid ?? (d?.key ? Number(String(d.key).match(/^vi_(\d+)_/)?.[1] ?? -1) : -1);
    for (let i = 0; i < m.ITEM_DEFS.length; i++) {
      const d = m.ITEM_DEFS[i];
      const vid = vidOf(d);
      if (vid === 771) { ammo = i; ammoKey = d.key; }
      // 火箭炮=消耗 771 的远程武器(键空间别名:vi_752_ 同时有 cloud_wall,vid 匹配不可靠)
      if (vid === 759 && ic.itemCombat(759)?.useAmmo === 771) { gun = i; gunKey = d.key; }
    }
  } catch { /* noop */ }
  if (gun < 0 || ammo < 0) return { err: 'items not found', gun, ammo };
  pl.inv.slots[pl.inv.selected] = { id: gun, stack: 1 };
  pl.inv.slots[54] = { id: ammo, stack: 99 };
  g.cb.onInventoryChanged();
  const ic = await import('/src/data/vanillaItemCombat.ts');
  const gunCombat = ic.itemCombat(759);
  const ammoCombat = ic.itemCombat(771);
  pl.x = d.cx - 140 - pl.w / 2; pl.y = ty * 16 - pl.h - 2; pl.vx = 0; pl.vy = 0;   // 脚踩平台上沿(曾 d.cy-h/2=嵌入 1px→火箭出生在实心格内)
  await new Promise((r) => setTimeout(r, 1200));
  const [mx, my] = g.camera.worldToScreen(d.cx, d.cy);
  g.input.mouseX = mx; g.input.mouseY = my;
  // 飘值计数
  let nums = 0;
  const orig = g.addDamageNumber.bind(g);
  g.addDamageNumber = (...a) => { nums++; return orig(...a); };
  g.input.mouseDown = true;
  let exploded = false, contactShake = 0;
  const traj = [];
  let last = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 16));
    const ps = (g.entities.projectiles || []).filter((p) => !p.dead && p.constructor.name === 'GrenadeProj');
    if (ps.length) {
      const p0 = ps[0];
      last = { i, dx: Math.round(p0.cx - d.cx), dy: Math.round(p0.cy - d.cy), fuse: p0.fuse,
        stick: !!p0.stickPending,
        tile: st.get(Math.floor(p0.cx / 16), Math.floor(p0.cy / 16)),
        solid: st.isSolid(Math.floor(p0.cx / 16), Math.floor(p0.cy / 16)) };
      traj.push(last);
    } else if (last) { traj.push({ ...last, gone: true }); exploded = true; break; }
    if (d.dummyShake > 0) { contactShake = d.dummyShake; break; }
    if (i > 50) { exploded = true; break; }
  }
  g.input.mouseDown = false;
  g.addDamageNumber = orig;
  const deathTile = last ? (() => {
    const wx = d.cx + last.dx, wy = d.cy + last.dy;
    return { t: st.get(Math.floor(wx / 16), Math.floor(wy / 16)), solid: st.isSolid(Math.floor(wx / 16), Math.floor(wy / 16)) };
  })() : null;
  return { gunKey, ammoKey, shoot: gunCombat?.shoot, useAmmo: gunCombat?.useAmmo, ammoShoot: ammoCombat?.shoot,
    held: pl.inv.slots[pl.inv.selected]?.id, gunId: gun, ammoId: ammo, hit: contactShake > 0, shake: contactShake, dmgNumbers: nums, exploded, deathTile, traj: traj.slice(0, 8) };
});
console.log(JSON.stringify(out));
await browser.close();
