// 一次性:训练假人命中修复复验 v3——①接触近战命中②弓箭命中③召唤物不追假人(08-24 原修目标)
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
  const itemsMod = await import('/src/data/items.ts');
  const { itemCombat, viIdFromKey } = await import('/src/data/vanillaItemCombat.ts');
  const DUMMY = tiles.TILE_BY_KEY['v_378_target_dummy'];
  const st = g.world.store;

  // 运行时武器解析(不依赖键名猜测)
  let meleeIdx = -1, bowIdx = -1, arrowIdx = -1, staffIdx = -1;
  itemsMod.ITEM_DEFS.forEach((d, i) => {
    if (!d || d.tool) return;
    const vid = viIdFromKey(d.key);
    const c = vid > 0 ? itemCombat(vid) : null;
    if (!c) return;
    if (meleeIdx < 0 && c.melee && !c.noMelee && !c.shoot && (c.useAnimation ?? 0) >= 20) meleeIdx = i;
    if (bowIdx < 0 && c.useAmmo === 40 && c.ranged) bowIdx = i;
    if (arrowIdx < 0 && (vid === 40 || d.ammoId === 40)) arrowIdx = i;
    if (staffIdx < 0 && vid === 1309) staffIdx = i;
  });

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

  const hurtLog = [];
  const origHurt = dummy.hurt.bind(dummy);
  dummy.hurt = (...a) => { hurtLog.push(Math.round(a[0])); return origHurt(...a); };
  const standNearDummy = () => {
    g.entities.projectiles.length = 0;
    g.player.x = (dx0 - 2) * 16; g.player.y = (dy0 + 2) * 16 - g.player.h;
  };

  const res = {};
  // ---- A. 接触近战 ----
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: meleeIdx, stack: 1 };
  standNearDummy();
  for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
  const [mx, my] = g.camera.worldToScreen((dx0 + 1) * 16 + 8, (dy0 + 1) * 16 + 24);
  g.input.mouseX = mx; g.input.mouseY = my;
  let meleeShakeMax = 0;
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 30; i++) {
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    meleeShakeMax = Math.max(meleeShakeMax, dummy.dummyShake);
    for (let i = 0; i < 15; i++) g.fixedUpdate(1 / 60);
  }
  res.melee = { key: itemsMod.ITEM_DEFS[meleeIdx]?.key, shakeMax: meleeShakeMax,
    hurtCount: hurtLog.length, dmgSample: hurtLog.slice(0, 5) };

  // ---- B. 弓箭 ----
  if (bowIdx >= 0 && arrowIdx >= 0) {
    hurtLog.length = 0;
    g.player.inv.selected = 0;
    g.player.inv.slots[0] = { id: bowIdx, stack: 1 };
    g.player.inv.slots[10] = { id: arrowIdx, stack: 50 };
    standNearDummy();
    g.player.x = (dx0 - 6) * 16;
    for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
    let peakProj = 0;
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < 45; i++) {
        g.input.mouseDown = true; g.input.mouseHeld = true;
        peakProj = Math.max(peakProj, g.entities.projectiles.length);
        g.fixedUpdate(1 / 60);
        g.input.mouseDown = false;
      }
      g.input.mouseDown = false; g.input.mouseHeld = false;
      for (let i = 0; i < 15; i++) g.fixedUpdate(1 / 60);
    }
    res.ranged = { bow: itemsMod.ITEM_DEFS[bowIdx]?.key, arrow: itemsMod.ITEM_DEFS[arrowIdx]?.key,
      peakProj, hurtCount: hurtLog.length, dmgSample: hurtLog.slice(0, 5) };
  }

  // ---- C. 召唤物不追打假人(2026-08-24 原修目标回归) ----
  if (staffIdx >= 0) {
    hurtLog.length = 0;
    g.player.inv.selected = 0;
    g.player.inv.slots[0] = { id: staffIdx, stack: 1 };
    if ('maxMana' in g.player) { g.player.maxMana = 200; g.player.mana = 200; }
    standNearDummy();
    for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
    const [cx2, cy2] = g.camera.worldToScreen((dx0 + 1) * 16 + 8, (dy0 + 1) * 16 + 16);
    g.input.mouseX = cx2; g.input.mouseY = cy2;
    for (let i = 0; i < 40; i++) {
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    // 玩家撤到远处(脱离挥击/接触距离),此后假人若再受击只可能来自召唤物追击
    g.player.x = (dx0 - 25) * 16;
    for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
    hurtLog.length = 0;
    const minionsBefore = g.entities.projectiles.length;
    for (let i = 0; i < 300; i++) g.fixedUpdate(1 / 60);   // 给足追踪时间
    res.minion = { staff: itemsMod.ITEM_DEFS[staffIdx]?.key, minions: minionsBefore,
      dummyHurtWhileAway: hurtLog.length, playerFar: Math.abs(g.player.cx - dummy.cx) > 300 };
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
