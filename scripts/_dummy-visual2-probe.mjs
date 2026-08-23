// 视觉验证 v2:带弹道插桩
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
  const idOf = (re) => { const k = Object.keys(window.__swItems).find((k) => re.test(k)); return k ? window.__swItems[k] : -1; };
  const shotgun = idOf(/^vi_534_/) >= 0 ? idOf(/^vi_534_/) : idOf(/^vi_575_/);
  // 绕开 __swItems 键别名污染:按 vid=97(火枪弹)直扫 ITEM_DEFS
  let bullet = -1;
  try {
    const m = await import('/src/data/items.ts');
    const DEFS = m.ITEM_DEFS;
    for (let i = 0; i < (DEFS?.length ?? 0); i++) {
      const d = DEFS[i];
      if ((d?.vid ?? -1) === 97 || /musket.?ball/i.test(d?.key ?? '')) { bullet = i; break; }
    }
  } catch (e) { bullet = { err: String(e).slice(0, 60) }; }
  const gunKey = Object.keys(window.__swItems).find((k) => /^vi_534_/.test(k));
  const ammoKey = Object.keys(window.__swItems).find((k) => /^vi_97_/.test(k));
  pl.inv.slots[pl.inv.selected] = { id: shotgun, stack: 1 };
  pl.inv.slots[54] = { id: bullet, stack: 999 };
  g.cb.onInventoryChanged();
  pl.x = d.cx - 110 - pl.w / 2; pl.y = d.cy - pl.h / 2; pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1200));
  const [mx, my] = g.camera.worldToScreen(d.cx, d.cy);
  g.input.mouseX = mx; g.input.mouseY = my;
  // 弹道采样
  const traj = [];
  g.input.mouseDown = true;
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 40));
    const ps = (g.entities.projectiles || []).filter((p) => !p.dead);
    const sample = { i, n: ps.length, shake: d.dummyShake, mouseX: g.input.mouseX, mouseY: g.input.mouseY, mdown: g.input.mouseDown };
    if (ps.length) {
      const p = ps[0];
      sample.dx = Math.round(p.cx - d.cx); sample.dy = Math.round(p.cy - d.cy);
      sample.vx = +p.vx.toFixed(2); sample.vy = +p.vy.toFixed(2);
      sample.cls = p.constructor.name; sample.dmg = p.damage; sample.pid = p.projId; sample.dropKey = p.dropKey ?? null;
      sample.age = p.age;
      const btx = Math.floor(p.cx / 16), bty = Math.floor(p.cy / 16);
      sample.tile = st.get(btx, bty); sample.solid = st.isSolid(btx, bty);
    }
    traj.push(sample);
    if (d.dummyShake > 0) break;
  }
  g.input.mouseDown = false;
  // 场地诊断:假人锚格与弹高行的 tile
  const dRow = [];
  for (let x = tx - 2; x <= tx + 3; x++) dRow.push({ x, t: st.get(x, ty), solid: st.isSolid(x, ty) });
  return { gunKey, ammoKey, gunId: shotgun, ammoId: bullet, musketId: idOf(/^vi_97_火枪子弹/), ammoSlot54: pl.inv.slots[54], heldId: pl.inv.slots[pl.inv.selected]?.id, anchor: [tx, ty - 1], dgeo: { cx: Math.round(d.cx), cy: Math.round(d.cy), x: Math.round(d.x), y: Math.round(d.y), w: d.w, h: d.h }, traj: traj.slice(0, 12), dRow };   // 2026-08-23 键名卫生:vi_97 后缀改正（曾误名"地牢砖墙",MusketBall=97）
});
console.log(JSON.stringify(out));
await browser.close();
