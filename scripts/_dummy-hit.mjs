// 一次性:训练假人命中复现 v2——铁阔剑(vid122 接触近战)+木弓木箭(射弹)双通道
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const DUMMY = tiles.TILE_BY_KEY['v_378_target_dummy'];
  const st = g.world.store;

  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 8;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  const py = gy - 6;
  for (let dy = -16; dy <= 2; dy++) for (let dx = -30; dx <= 40; dx++) {
    st.setTile(px + dx, py + dy, 0);
    st.liquid[st.idx(px + dx, py + dy)] = 0;
  }
  for (let dx = -30; dx <= 40; dx++) st.setTile(px + dx, py + 1, 2);
  const dx0 = px + 5, dy0 = py - 4;
  for (let c = 0; c < 2; c++) for (let rI = 0; rI < 3; rI++)
    st.setTile(dx0 + c, dy0 + rI, DUMMY, c * 18, rI * 18);
  g.player.x = px * 16; g.player.y = (py - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  g.entities.enemies.length = 0;
  g.spawnDummyAt(dx0, dy0);
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  const dummy = g.entities.enemies.find((e) => e.vanillaId === 488 && !e.dead);
  if (!dummy) return { fail: 'dummy NPC not spawned' };

  let dmgEvents = [];
  const origAdd = g.addDamageNumber.bind(g);
  g.addDamageNumber = (...a) => { dmgEvents.push({ v: a[2], x: a[0], y: a[1] }); return origAdd(...a); };
  const hurtLog = [];
  const origHurt = dummy.hurt.bind(dummy);
  dummy.hurt = (...a) => { hurtLog.push(a.slice(0, 3)); return origHurt(...a); };

  const res = {};
  // ---- A. 铁阔剑 vid122(纯接触近战) ----
  const swordIdx = items.ITEM_DEFS.findIndex((d) => (d?.vid ?? -1) === 122);
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: swordIdx, stack: 1 };
  g.player.x = (dx0 - 2) * 16;
  g.player.y = (dy0 + 2) * 16 - g.player.h;
  for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
  const [sx1, sy1] = g.camera.worldToScreen((dx0 + 1) * 16 + 8, (dy0 + 1) * 16 + 24);
  g.input.mouseX = sx1; g.input.mouseY = sy1;
  const swings = [];
  for (let s = 0; s < 3; s++) {
    dmgEvents.length = 0; hurtLog.length = 0;
    let swingSeen = false, projSeen = 0;
    for (let i = 0; i < 30; i++) {
      g.input.mouseDown = true; g.input.mouseHeld = true;
      if (g.swing) swingSeen = true;
      projSeen = Math.max(projSeen, g.entities.projectiles.length);
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    swings.push({ swingSeen, projPeak: projSeen, shake: dummy.dummyShake, hurt: hurtLog.splice(0), dmg: dmgEvents.splice(0) });
    for (let i = 0; i < 15; i++) g.fixedUpdate(1 / 60);
  }
  res.melee = {
    swordKey: items.ITEM_DEFS[swordIdx]?.key,
    swings,
    playerCx: g.player.cx, playerCy: g.player.cy,
    dummyBox: [dummy.x, dummy.y, dummy.w, dummy.h],
  };

  // ---- B. 木弓+木箭(vid 96 + ammo 40) ----
  const bowIdx = items.ITEM_DEFS.findIndex((d) => (d?.vid ?? -1) === 96);
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: bowIdx, stack: 1 };
  g.player.inv.slots[10] = { id: items.ITEM_DEFS.findIndex((d) => (d?.vid ?? -1) === 40), stack: 25 };  // 弹药行
  clearHostiles: g.entities.projectiles.length = 0;
  const shots = [];
  for (let s = 0; s < 2; s++) {
    dmgEvents.length = 0; hurtLog.length = 0;
    let peakProj = 0;
    for (let i = 0; i < 40; i++) {
      g.input.mouseDown = true; g.input.mouseHeld = true;
      peakProj = Math.max(peakProj, g.entities.projectiles.length);
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    shots.push({ peakProj, shake: dummy.dummyShake, hurt: hurtLog.splice(0), dmg: dmgEvents.splice(0) });
    for (let i = 0; i < 15; i++) g.fixedUpdate(1 / 60);
  }
  res.ranged = { bowKey: items.ITEM_DEFS[bowIdx]?.key, shots };
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
