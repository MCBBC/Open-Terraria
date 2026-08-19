// 渔夫报障终版复现：真实用户场景（沙滩+海洋+bound 态）
// ① spawner 海洋支是否真出 Enemy 376（用户看到的"睡渔夫"）
// ② bound TownNPC angler 右键唤醒链是 talk 路还是 touch 路；分派链前置分支是否吃掉 rightDown
// ③ Enemy 376 近战/弹幕伤害 + 右键无交互
// 运行:SW_ORIGIN=http://localhost:5231 node tools/run-diag.mjs scripts/_angler-repro2.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const TILE = 16;
  const st = g.world.store;
  const res = {};
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');

  // ---- 0. 进世界态 ----
  const boundAngler = g.entities.npcs.find(n => n.npcKey === 'angler' && n.bound && !n.dead);
  res.worldState = {
    savedAngler: !!g.world.flags.savedAngler,
    boundTownAngler: boundAngler ? { x: Math.round(boundAngler.x), y: Math.round(boundAngler.y), w: boundAngler.w, h: boundAngler.h, hp: boundAngler.hp } : null,
    enemy376Count: g.entities.enemies.filter(e => e.vanillaId === 376 && !e.dead).length,
  };

  // ---- 1. 玩家挪到出生侧海洋边缘, 等待 spawner 海洋支掷出 Enemy 376 ----
  const boundX = boundAngler ? Math.floor(boundAngler.cx / TILE) : 40;
  const oceanTx = Math.min(Math.max(boundX, 12), st.w - 13);
  let gy = Math.floor(g.world.groundLevel) - 4;
  while (gy < st.h - 4 && !st.isSolid(oceanTx, gy)) gy++;
  g.player.x = oceanTx * TILE; g.player.y = (gy - 4) * TILE; g.player.vx = 0; g.player.vy = 0;
  g.enemySpawnEnabled = true;
  g.world.clock.timeOfDay = 0.4;   // 白天(刷怪窗口)
  res.oceanWait = { spawnTx: oceanTx };
  let enemy376 = null;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    enemy376 = g.entities.enemies.find(e => e.vanillaId === 376 && !e.dead) || null;
    if (enemy376) { res.oceanWait.ticksWaited = i; break; }
  }
  g.enemySpawnEnabled = false;
  res.oceanWait.spawned = !!enemy376;
  if (enemy376) {
    res.oceanWait.pos = { x: Math.round(enemy376.x), y: Math.round(enemy376.y), w: enemy376.w, h: enemy376.h, hp: enemy376.hp };
    // 该实体是否可交互/可伤（用户实测的两症状）
    // 1a. 近战（铜短剑）
    g.player.x = enemy376.x - g.player.w - 24;
    g.player.y = enemy376.y + enemy376.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    const key0 = VANILLA_ITEM_KEY_BY_ID[4];
    g.player.inv.slots[0] = { id: ITEM_BY_KEY[key0], stack: 1 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    await sleep(300);
    const [sx, sy] = g.camera.worldToScreen(enemy376.cx, enemy376.cy);
    g.input.mouseX = sx; g.input.mouseY = sy;
    const hp0 = enemy376.hp;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    await sleep(900);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    res.enemy376_melee = { hp0, hp1: enemy376.hp, dmg: hp0 - enemy376.hp };
    // 1b. 右键
    let dialogCalls = 0;
    const od = g.cb.onNpcDialog;
    g.cb.onNpcDialog = (...a) => { dialogCalls++; return od?.(...a); };
    g.input.mouseX = sx; g.input.mouseY = sy;
    g.input.rightDown = true;
    await sleep(400);
    g.input.rightDown = false;
    res.enemy376_rightClick = { dialogCalls, stillThere: !enemy376.dead };
    g.cb.onNpcDialog = od;
    enemy376.dead = true;
    await sleep(100);
  }

  // ---- 2. bound TownNPC 右键唤醒链：区分 talk 路与 touch 路 ----
  if (boundAngler && !boundAngler.dead && boundAngler.bound) {
    // 玩家停在 24px 外（AABB 不相交 → boundTouchCheck 不可能触发）
    g.player.x = boundAngler.x - g.player.w - 24;
    g.player.y = boundAngler.y + boundAngler.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    await sleep(400);
    const overlap = g.player.x < boundAngler.x + boundAngler.w && g.player.x + g.player.w > boundAngler.x
      && g.player.y < boundAngler.y + boundAngler.h && g.player.y + g.player.h > boundAngler.y;
    const dist = Math.hypot(boundAngler.cx - g.player.cx, boundAngler.cy - g.player.cy);
    res.boundWake = { overlap, distPx: Math.round(dist), boundBefore: !!boundAngler.bound };
    // 鼠标点 bound 盒中心
    const [bsx, bsy] = g.camera.worldToScreen(boundAngler.cx, boundAngler.cy);
    g.input.mouseX = bsx; g.input.mouseY = bsy;
    let dialogCalls2 = 0;
    const od2 = g.cb.onNpcDialog;
    g.cb.onNpcDialog = (...a) => { dialogCalls2++; return od2?.(...a); };
    g.input.rightDown = true;
    await sleep(400);
    g.input.rightDown = false;
    res.boundWake.boundAfter = !!boundAngler.bound;
    res.boundWake.savedAngler = !!g.world.flags.savedAngler;
    res.boundWake.dialogCalls = dialogCalls2;
    // 右键后（已解救）再右键一次 → 应开对话
    if (!boundAngler.bound && !boundAngler.dead) {
      const [bsx2, bsy2] = g.camera.worldToScreen(boundAngler.cx, boundAngler.cy);
      g.input.mouseX = bsx2; g.input.mouseY = bsy2;
      g.input.rightDown = true;
      await sleep(400);
      g.input.rightDown = false;
      res.boundWake.secondClickDialogCalls = dialogCalls2;
      g.closeNpcDialog();
    }
    g.cb.onNpcDialog = od2;
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
