// 渔夫报障复现探针：①渔夫可被攻击掉血 ②无法对话
// 运行:SW_ORIGIN=http://localhost:5231 node tools/run-diag.mjs scripts/_angler-repro.mjs
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
  g.enemySpawnEnabled = false;
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');

  // ---- 0. 进世界时的渔夫态（用户所见）----
  res.worldState = {
    savedAngler: !!g.world.flags.savedAngler,
    townAnglers: g.entities.npcs
      .filter(n => n.npcKey === 'angler')
      .map(n => ({ bound: !!n.bound, hp: n.hp, dead: !!n.dead, vid: n.vanillaId })),
    enemy376: g.entities.enemies
      .filter(e => e.vanillaId === 376)
      .map(e => ({ hp: e.hp, dead: !!e.dead, friendly: !!e.def?.friendly })),
  };

  // ---- 对话计数（monkeypatch）----
  let dialogCalls = 0;
  const origDialog = g.cb.onNpcDialog;
  g.cb.onNpcDialog = (...a) => { dialogCalls++; return origDialog?.(...a); };
  const resetDialog = () => { dialogCalls = 0; g.closeNpcDialog(); sleep(50); };

  // ---- 公共：玩家右侧找一块 4 格宽平地（靶/玩家都站这）----
  const findSpot = () => {
    const tx0 = Math.floor(g.player.cx / TILE);
    let ty = Math.floor(g.player.cy / TILE);
    while (ty < st.h - 4 && !st.isSolid(tx0 + 6, ty)) ty++;
    // 抬升到空中确保无水无实心
    let y = ty - 2;
    while (y > 4 && (st.liquid[st.idx(tx0 + 6, y)] > 0)) y--;
    return { tx: tx0 + 6, ty };
  };
  // 玩家停在靶左侧 gap 像素（AABB 不相交 → boundTouchCheck 不触发）
  const parkPlayer = (ent, gap) => {
    g.player.x = ent.x - g.player.w - gap;
    g.player.y = ent.y + ent.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  };
  const aimAt = (ent) => {
    const [sx, sy] = g.camera.worldToScreen(ent.cx, ent.cy);
    g.input.mouseX = sx; g.input.mouseY = sy;
  };
  const give = (vid) => {
    const key = VANILLA_ITEM_KEY_BY_ID[vid];
    g.player.inv.slots[0] = { id: ITEM_BY_KEY[key], stack: 1 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
  };

  // 造靶：Enemy 376（睡渔夫，敌怪桶）与 bound TownNPC 'angler'（npcs 桶）
  const makeEnemy376 = (tx, ty) => {
    const e = Enemy.fromVanilla(376, tx * TILE + 8, (ty - 1) * TILE);
    e.id = g.entities.nextId++;
    e.hp = e.maxHp = 250;
    g.entities.add(e, 'enemies');
    return e;
  };
  const makeBoundAngler = (tx, ty) => {
    const n = new TownNPC('angler', tx * TILE + 8, ty * TILE);
    n.id = g.entities.nextId++;
    n.bound = true;
    n.hp = n.maxHp = 250;
    g.entities.add(n, 'npcs');
    return n;
  };
  const makeFreeAngler = (tx, ty) => {
    const n = new TownNPC('angler', tx * TILE + 8, ty * TILE);
    n.id = g.entities.nextId++;
    n.hp = n.maxHp = 250;
    g.entities.add(n, 'npcs');
    return n;
  };

  // ---- 1. 近战打 Enemy 376（铜短剑 vi_4）----
  {
    const spot = findSpot();
    const e = makeEnemy376(spot.tx, spot.ty);
    give(4);   // 铜短剑
    parkPlayer(e, 24);
    await sleep(300);
    aimAt(e);
    const hp0 = e.hp;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    await sleep(900);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    res.melee_enemy376 = { hp0, hp1: e.hp, dmg: hp0 - e.hp, dead: !!e.dead };
    e.dead = true;
    await sleep(100);
  }

  // ---- 2. 近战打 bound TownNPC angler ----
  {
    const spot = findSpot();
    const n = makeBoundAngler(spot.tx, spot.ty);
    give(4);
    parkPlayer(n, 24);
    await sleep(300);
    aimAt(n);
    const hp0 = n.hp;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    await sleep(900);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    res.melee_boundTownAngler = { hp0, hp1: n.hp, dmg: hp0 - n.hp, stillBound: !!n.bound };
    n.dead = true;
    await sleep(100);
  }

  // ---- 3. 近战打【已解救】TownNPC angler（自然态）----
  {
    const spot = findSpot();
    const n = makeFreeAngler(spot.tx, spot.ty);
    give(4);
    parkPlayer(n, 24);
    await sleep(300);
    aimAt(n);
    const hp0 = n.hp;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    await sleep(900);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    res.melee_freeTownAngler = { hp0, hp1: n.hp, dmg: hp0 - n.hp };
    n.dead = true;
    await sleep(100);
  }

  // ---- 4. 弹幕打 Enemy 376（玩家箭）----
  {
    const spot = findSpot();
    const e = makeEnemy376(spot.tx, spot.ty);
    parkPlayer(e, 200);
    await sleep(300);
    const y = e.cy;
    const a = new Arrow(e.x - 120, y - 4, 8, 0, 25, 3, 1);
    a.id = g.entities.nextId++;
    g.entities.add(a, 'projectiles');
    const hp0 = e.hp;
    await sleep(600);
    res.arrow_enemy376 = { hp0, hp1: e.hp, dmg: hp0 - e.hp, dead: !!e.dead };
    e.dead = true; a.dead = true;
    await sleep(100);
  }

  // ---- 5. 弹幕打已解救 TownNPC angler（巫毒门应拦住）----
  {
    const spot = findSpot();
    const n = makeFreeAngler(spot.tx, spot.ty);
    parkPlayer(n, 200);
    await sleep(300);
    const a = new Arrow(n.x - 120, n.cy - 4, 8, 0, 25, 3, 1);
    a.id = g.entities.nextId++;
    g.entities.add(a, 'projectiles');
    const hp0 = n.hp;
    await sleep(600);
    res.arrow_freeTownAngler = { hp0, hp1: n.hp, dmg: hp0 - n.hp };
    n.dead = true; a.dead = true;
    await sleep(100);
  }

  // ---- 6. 右键对话 bound TownNPC angler ----
  {
    const spot = findSpot();
    const n = makeBoundAngler(spot.tx, spot.ty);
    parkPlayer(n, 24);
    await sleep(200);
    aimAt(n);
    resetDialog();
    const bound0 = !!n.bound;
    g.input.rightDown = true;
    await sleep(400);
    g.input.rightDown = false;
    res.talk_boundTownAngler = {
      bound0, bound1: !!n.bound,
      savedAngler: !!g.world.flags.savedAngler,
      dialogCalls,
    };
    await resetDialog();
    n.dead = true;
    await sleep(100);
  }

  // ---- 7. 右键对话 Enemy 376 ----
  {
    const spot = findSpot();
    const e = makeEnemy376(spot.tx, spot.ty);
    parkPlayer(e, 24);
    await sleep(200);
    aimAt(e);
    resetDialog();
    g.input.rightDown = true;
    await sleep(400);
    g.input.rightDown = false;
    res.talk_enemy376 = { dialogCalls, hp: e.hp, dead: !!e.dead };
    e.dead = true;
    await sleep(100);
  }

  g.cb.onNpcDialog = origDialog;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
