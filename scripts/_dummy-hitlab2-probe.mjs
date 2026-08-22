// 假人命中实验室 v2:人工铲平场地(平台+净空走廊)排除地形干扰
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
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const DIRT = window.__swTileByKey('v_2_dirt') ?? window.__swTileByKey('v_1_stone') ?? 1;
  const AIR = 0;
  // 场地:玩家右侧 8 格,平台行 ty,上方 8 行净空,左右各 14 格
  const tx = Math.floor(pl.cx / 16) + 8;
  let ty = Math.floor((pl.y + pl.h) / 16) + 2;
  ty = Math.max(ty, 20);
  for (let x = tx - 14; x <= tx + 14; x++) {
    for (let y = ty - 9; y < ty; y++) st.setTile(x, y, AIR, { wall: 0 });
    st.setTile(x, ty, DIRT);
    for (let y = ty + 1; y <= ty + 3; y++) st.setTile(x, y, DIRT);
  }
  const T378 = window.__swTileByKey('v_378_target_dummy');
  // 全 6 格帧(2×3,18px 步进)——单格写会留平台实心格挡弹(探针场地伪影)
  for (let cy2 = 0; cy2 < 3; cy2++)
    for (let cx2 = 0; cx2 < 2; cx2++)
      st.setTile(tx + cx2, ty - 1 + cy2, T378, cx2 * 18, cy2 * 18);
  g['spawnDummyAt'](tx, ty - 1);
  await new Promise((r) => setTimeout(r, 600));
  const d = (g.entities.enemies || []).find((n) => !n.dead && n.vanillaId === 488);
  if (!d) return { err: 'no dummy', anchor: [tx, ty - 1] };
  // ---- 手工子弹扫过命中盒中心 ----
  const manP = new Arrow(d.cx - 120, d.cy - 2, 4, 0, 25, 2, 14, null, { grav: 0 });
  g.entities.add(manP, 'projectiles');
  const traj = [];
  let hitShake = 0, hitOv = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 16));
    const ov = !manP.dead && (manP.x < d.x + d.w && manP.x + manP.w > d.x && manP.y < d.y + d.h && manP.y + manP.h > d.y);
    if (ov) hitOv = true;
    traj.push({ i, dx: Math.round(manP.x - d.x), alive: !manP.dead, ov, shake: d.dummyShake });
    if (d.dummyShake > 0) { hitShake = d.dummyShake; break; }
    if (manP.dead) break;
  }
  // ---- 真枪射击(霰弹枪)验证完整射击链:传送玩家到假人左侧 120px(相机每帧
  //      follow 玩家,覆写 camera 无效),缓动落定后按 worldToScreen 精确瞄准 ----
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
  pl.x = d.cx - 120 - pl.w / 2; pl.y = d.cy - pl.h / 2;
  pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1200));   // 相机 0.15 缓动落定
  const [mx, my] = g.camera.worldToScreen(d.cx, d.cy);
  g.input.mouseX = mx; g.input.mouseY = my;
  g.input.mouseDown = true;
  let gunHit = 0;
  const ptraj = [];
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 40));
    if (d.dummyShake > hitShake) { gunHit = 1; break; }
    for (const p of (g.entities.projectiles || [])) {
      if (p.dead || p === manP) continue;
      ptraj.push({ i, pid: p.projId, dx: Math.round(p.cx - d.cx), dy: Math.round(p.cy - d.cy), vx: +p.vx.toFixed(1), vy: +p.vy.toFixed(1) });
    }
  }
  g.input.mouseDown = false;
  return { anchor: [tx, ty - 1], geo: { w: d.w, h: d.h, cx: Math.round(d.cx), cy: Math.round(d.cy) },
    manualHit: { hitShake, hitOv, trajTail: traj.slice(-6) }, gunHit, ptraj: ptraj.slice(0, 10), finalShake: d.dummyShake, hp: d.hp };
});
console.log(JSON.stringify(out));
await browser.close();
