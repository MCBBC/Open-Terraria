// 渔夫修复终验：①睡渔夫=真 Enemy 376 且可见 ②近战/弹幕免伤 ③右键唤醒链(Transform+旗+对话)
// ④解救后对话有真台词 ⑤离屏不 despawn
// 运行:SW_ORIGIN=http://localhost:5231 node tools/run-diag.mjs scripts/_angler-verify.mjs
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
await new Promise(r => setTimeout(r, 2500));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const TILE = 16;
  const st = g.world.store;
  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.5;
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const res = {};

  // ---- 1. 世界态：睡渔夫应为真 Enemy 376，无 bound TownNPC angler ----
  let angler376 = g.entities.enemies.find(e => e.vanillaId === 376 && !e.dead) || null;
  res.state = {
    enemy376: !!angler376,
    boundTownAngler: g.entities.npcs.some(n => n.npcKey === 'angler' && n.bound && !n.dead),
    savedAngler: !!g.world.flags.savedAngler,
  };
  if (!angler376) { res.error = 'no Enemy 376 placed'; return res; }
  res.state.pos = { x: Math.round(angler376.x), y: Math.round(angler376.y), w: angler376.w, h: angler376.h, hp: angler376.hp };
  // 随机世界渔夫可能贴地图边缘（探针玩家停不进边框区）——搬到玩家旁平地再测
  {
    const ptx = Math.floor(g.player.cx / TILE);
    let ty2 = Math.floor(g.player.cy / TILE);
    while (ty2 < st.h - 4 && !st.isSolid(ptx, ty2)) ty2++;
    angler376.x = ptx * TILE + 8 - angler376.w / 2;
    angler376.y = ty2 * TILE - angler376.h;
  }

  // ---- 2. 近战免伤（铜短剑）----
  const park = (e) => {
    g.player.x = e.x - g.player.w - 20;
    g.player.y = e.y + e.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  };
  park(angler376);
  const key0 = VANILLA_ITEM_KEY_BY_ID[4];
  g.player.inv.slots[0] = { id: ITEM_BY_KEY[key0], stack: 1 };
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  await sleep(300);
  park(angler376);
  const [sx, sy] = g.camera.worldToScreen(angler376.cx, angler376.cy);
  g.input.mouseX = sx; g.input.mouseY = sy;
  const hpMelee0 = angler376.hp;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 8; i++) { park(angler376); await sleep(100); }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  res.melee = { hp0: hpMelee0, hp1: angler376.hp, dmg: hpMelee0 - angler376.hp };

  // ---- 3. 弹幕免伤（贴靶箭）----
  park(angler376);
  await sleep(300);
  const arrow = new Arrow(angler376.x - 20, angler376.cy - 3, 8, 0, 25, 3, 1);
  arrow.id = g.entities.nextId++;
  g.entities.add(arrow, 'projectiles');
  const hpArrow0 = angler376.hp;
  await sleep(600);
  res.arrow = { hp0: hpArrow0, hp1: angler376.hp, dmg: hpArrow0 - angler376.hp, arrowDead: !!arrow.dead };
  arrow.dead = true;

  // ---- 4. 右键唤醒链 ----
  let dialogTexts = [];
  const od = g.cb.onNpcDialog;
  g.cb.onNpcDialog = (...a) => { dialogTexts.push(a[1]); return od?.(...a); };
  park(angler376);
  await sleep(600);
  park(angler376);
  await sleep(200);
  const [wsx, wsy] = g.camera.worldToScreen(angler376.cx, angler376.cy);
  g.input.mouseX = wsx; g.input.mouseY = wsy;
  g.input.rightDown = true;
  for (let i = 0; i < 4; i++) { park(angler376); await sleep(80); }
  g.input.rightDown = false;
  await sleep(300);
  const freedAngler = g.entities.npcs.find(n => n.npcKey === 'angler' && !n.dead && !n.bound) || null;
  res.wake = {
    enemy376Gone: !!angler376.dead || !g.entities.enemies.some(e => e.vanillaId === 376 && !e.dead),
    freedTownAngler: !!freedAngler,
    savedAngler: !!g.world.flags.savedAngler,
    wakeDialog: dialogTexts[0] ?? null,
  };
  g.closeNpcDialog();

  // ---- 5. 解救后再对话：真台词（非 '……'）----
  if (freedAngler) {
    await sleep(400);   // 对话 UI 关闭余波（探针曾因 2 参包装器吞 buttons 崩掉帧循环——已修）
    dialogTexts = [];
    g.player.x = freedAngler.x - g.player.w - 20;
    g.player.y = freedAngler.y + freedAngler.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    await sleep(300);
    g.player.x = freedAngler.x - g.player.w - 20;
    g.player.y = freedAngler.y + freedAngler.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    // 解救后的渔夫会走动（homeless 游走）——锁定其位置+每帧重瞄（真实玩家用眼跟踪）
    const lock = { x: freedAngler.x, y: freedAngler.y };
    const aim = () => {
      freedAngler.x = lock.x; freedAngler.y = lock.y;
      freedAngler.vx = 0; freedAngler.vy = 0;
      g.player.x = freedAngler.x - g.player.w - 20;
      g.player.y = freedAngler.y + freedAngler.h - g.player.h;
      g.player.vx = 0; g.player.vy = 0;
      const [fsx2, fsy2] = g.camera.worldToScreen(freedAngler.cx, freedAngler.cy);
      g.input.mouseX = fsx2; g.input.mouseY = fsy2;
    };
    // 插桩分派链
    res.ftDispatch = [];
    const ofc = g.findChestNear.bind(g);
    g.findChestNear = (tx, ty) => { const r = ofc(tx, ty); res.ftDispatch.push(`chest(${tx},${ty})=${!!r}`); return r; };
    const otn = g.talkToNearbyNpc.bind(g);
    g.talkToNearbyNpc = (tx, ty) => { const r = otn(tx, ty); res.ftDispatch.push(`talk(${tx},${ty})=${r}`); return r; };
    const oia = g.interactAt.bind(g);
    g.interactAt = (tx, ty) => { res.ftDispatch.push(`interact(${tx},${ty})`); return oia(tx, ty); };
    // ★先瞄再按右键（rightDown 是边沿语义：按下帧即分派，若先按后瞄会被旧鼠标
    //   位置的分派分支消费掉——真实用户先移动鼠标再点击，同序）
    for (let i = 0; i < 10; i++) { aim(); await sleep(16); }
    g.input.rightDown = true;
    for (let i = 0; i < 10; i++) { aim(); await sleep(16); }
    g.input.rightDown = false;
    g.findChestNear = ofc; g.talkToNearbyNpc = otn; g.interactAt = oia;
    res.freedTalk = { dialogOpened: dialogTexts.length > 0, chat: dialogTexts[0] ?? null, isEllipsis: dialogTexts[0] === '……', dispatch: res.ftDispatch.slice(0, 8) };
    g.closeNpcDialog();
  }
  g.cb.onNpcDialog = od;

  // ---- 6. 离屏 despawn 豁免（另放一只测）----
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const ptx = Math.floor(g.player.cx / TILE);
  let ty = Math.floor(g.player.cy / TILE);
  while (ty < st.h - 4 && !st.isSolid(ptx, ty)) ty++;
  const e2 = Enemy.fromVanilla(376, ptx * TILE + 8, ty * TILE);
  e2.id = g.entities.nextId++;
  g.entities.add(e2, 'enemies');
  // 玩家拉远 100 格
  g.player.x += 100 * TILE;
  await sleep(17000);   // > 750t 离屏
  res.despawnExempt = { stillAlive: !e2.dead };
  e2.dead = true;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
