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
  st.setTile(tx, ty - 1, T378);   // 假人立在平台上(锚格=脚下一格,378 高 3 格向上)
  g['spawnDummyAt'](tx, ty - 1);
  await new Promise((r) => setTimeout(r, 600));
  const d = (g.entities.enemies || []).find((n) => !n.dead && n.vanillaId === 488);
  if (!d) return { err: 'no dummy', anchor: [tx, ty - 1] };
  // ---- 手工子弹扫过命中盒中心 ----
  const p = new Arrow(d.cx - 120, d.cy - 2, 4, 0, 25, 2, 14, null, { grav: 0 });
  g.entities.add(p, 'projectiles');
  const traj = [];
  let hitShake = 0, hitOv = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 16));
    const ov = !p.dead && (p.x < d.x + d.w && p.x + p.w > d.x && p.y < d.y + d.h && p.y + p.h > d.y);
    if (ov) hitOv = true;
    traj.push({ i, dx: Math.round(p.x - d.x), alive: !p.dead, ov, shake: d.dummyShake });
    if (d.dummyShake > 0) { hitShake = d.dummyShake; break; }
    if (p.dead) break;
  }
  // ---- 真枪射击(霰弹枪)验证完整射击链:传送玩家到假人左侧 120px(相机每帧
  //      follow 玩家,覆写 camera 无效),缓动落定后按 worldToScreen 精确瞄准 ----
  const idOf = (re) => { const k = Object.keys(window.__swItems).find((k) => re.test(k)); return k ? window.__swItems[k] : -1; };
  const shotgun = idOf(/^vi_534_/) >= 0 ? idOf(/^vi_534_/) : idOf(/^vi_575_/);
  const bullet = idOf(/^vi_97_/);
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
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 60));
    if (d.dummyShake > hitShake) { gunHit = 1; break; }
  }
  g.input.mouseDown = false;
  return { anchor: [tx, ty - 1], geo: { w: d.w, h: d.h, cx: Math.round(d.cx), cy: Math.round(d.cy) },
    manualHit: { hitShake, hitOv, trajTail: traj.slice(-6) }, gunHit, finalShake: d.dummyShake, hp: d.hp };
});
console.log(JSON.stringify(out));
await browser.close();
