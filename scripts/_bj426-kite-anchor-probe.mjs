// BJ426 验收探针（修复后）：四连逐发实机验证。
//   A 位置门：空中无支撑拒置 / 墙档放置允许（帧档=4）
//   B 消耗面：地面放置成功 → stack-1（消耗 1）
//   C 边沿门：按住右键拖过 4 个有效点位 → 只放 1 桩（按压沿触发一次）
//   D 飞行态门：风筝弹在飞 → 右键不放置（收线仍工作）
//   E 回收面：右键取回 → 线圈 tile 消失 + 恰返 1 + 实体消散
//   F 守恒面：放 1 收 1 全程物品总数不变（复制链关闭）
// 用法: SW_ORIGIN=http://localhost:5650 node tools/run-diag.mjs scripts/_bj426-kite-anchor-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log(JSON.stringify({ fatal: 'boot timeout' })); await browser.close(); process.exit(1); }
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const step = async (n) => { for (let i = 0; i < n; i++) { g.fixedUpdate(1 / 60); await raf(); g.entities.enemies.length = 0; } };
  const items = await import('/src/data/items.ts');
  const tilesMod = await import('/src/data/tiles.ts');
  const T723ID = tilesMod.TILE_BY_KEY['v_723_kite_anchor'];
  const st = g.world.store;
  const p = g.player;
  const R = { checks: [], trace: [] };
  const ck = (name, ok, note = '') => R.checks.push({ name, ok, note });
  const KITE_VID = 4613;                                    // 猪龙风筝（用户实报件）
  const id = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[KITE_VID]];
  // 物品经济账本：spawned = 探针累计投放（give 增、清退减）——F 守恒面基准
  let spawned = 0;
  const give = (n) => { spawned -= invKites(); p.inv.slots[0] = { id, stack: n, prefix: 0 }; spawned += n; };
  // 钉位 + 找一块平整场地：x=400..415,y=sy 行实心带
  let sy = 40; for (; sy < st.h - 10 && !st.isSolid(400, sy); sy++) {}
  for (let x = 396; x <= 420; x++) for (let y = sy; y < sy + 3; y++) st.setTile(x, y, 1, 0, 0);   // 人造泥地
  for (let x = 396; x <= 420; x++) for (let y = sy - 4; y < sy; y++) if (st.hasTile(x, y)) st.setTile(x, y, 0); // 清空域
  const pin = () => { p.x = 402 * 16; p.y = (sy - 4) * 16; p.vx = 0; p.vy = 0; p.useTime = 0; };
  const pinAt = (tx_) => { p.x = tx_ * 16; p.y = (sy - 4) * 16; p.vx = 0; p.vy = 0; p.useTime = 0; };
  const invKites = () => p.inv.slots.filter((s) => s && items.ITEM_DEFS[s.id]?.vid === KITE_VID).reduce((a, s) => a + s.stack, 0);
  const dropKites = () => g.entities.drops.filter((d) => !d.dead && items.ITEM_DEFS[d.itemId]?.vid === KITE_VID).reduce((a, d) => a + d.stack, 0);
  const total = () => invKites() + dropKites();
  g.entities.enemies.length = 0;
  pin(); give(3);
  await step(10);
  const aim = (tx_, ty_) => {
    const [sx2, sy2] = g.camera.worldToScreen(tx_ * 16 + 8, ty_ * 16 + 8);
    g.input.mouseX = sx2; g.input.mouseY = sy2;
  };
  const press = async (tx_, ty_, pinX = 402) => {            // 单次右键按压沿
    for (let i = 0; i < 10; i++) { pinAt(pinX); g.fixedUpdate(1 / 60); await raf(); }   // 相机先收敛防瞄准漂移
    g.input.rightDown = true;
    for (let i = 0; i < 4; i++) { pinAt(pinX); aim(tx_, ty_); g.fixedUpdate(1 / 60); await raf(); }   // 每帧重瞄兜底
    g.input.rightDown = false;
    for (let i = 0; i < 2; i++) { pinAt(pinX); g.fixedUpdate(1 / 60); await raf(); }
  };
  const tile723At = (x, y) => st.type[st.idx(x, y)] === T723ID ? st.frameX[st.idx(x, y)] : -1;
  const recAt = (x, y) => g.world.furnitureItems.find((r) => r.x === x && r.y === y && r.kind === 'kite_anchor');
  const entAt = (x, y) => g.leashed.kites.filter((e) => e.ax === x && e.ay === y && e.active).length;

  // ---- A. 位置门：空中无支撑 → 拒 ----
  give(3);
  await press(403, sy - 3);
  ck('(A) 空中无支撑拒置（五锚档全失）', !recAt(403, sy - 3) && entAt(403, sy - 3) === 0 && tile723At(403, sy - 3) < 0,
    `tile=${tile723At(403, sy - 3)} stack=${p.inv.slots[0]?.stack}`);
  // ---- A2. 墙档：背后有墙 → 允许,帧档=4×18 ----
  st.wall[st.idx(403, sy - 2)] = 2;
  await press(403, sy - 2);
  const a2fx = tile723At(403, sy - 2);
  ck('(A2) 墙档允许且帧档=4×18（AnchorWall 首中档）', a2fx === 72 && recAt(403, sy - 2) !== undefined,
    `frameX=${a2fx}(expect 72) rec=${!!recAt(403, sy - 2)} stack=${p.inv.slots[0]?.stack}`);
  // 清 A2 桩
  g.retrieveLeashedAnchor(403, sy - 2, 1); await step(3);
  st.wall[st.idx(403, sy - 2)] = 0;

  // ---- B. 消耗面：地面放置 → stack-1 + 掉落为 0 ----
  give(3);
  const before = invKites();
  await press(405, sy - 1);
  const afterPlace = invKites();
  R.trace.push(`B-debug: below=${st.type[st.idx(405, sy)]} solid=${st.isSolid(405, sy)} tgt=${st.type[st.idx(405, sy - 1)]} wall=${st.wall[st.idx(405, sy - 1)]} px=${Math.floor(p.x / 16)} py=${Math.floor(p.y / 16)} useTime=${p.useTime}`);
  ck('(B) 地面放置成功且消耗 1（PlaceFromPlayerPlacementHook --stack）',
    tile723At(405, sy - 1) === 0 && afterPlace === before - 1 && entAt(405, sy - 1) === 1,
    `tile=${tile723At(405, sy - 1)} inv ${before}->${afterPlace} ent=${entAt(405, sy - 1)}`);

  // ---- C. 边沿门：按住拖过 3 点 → 仅 1 桩（按压沿）----
  await step(20);                                            // 等 B 的 useTime 冷却清零（原版同拍拒按）
  aim(407, sy - 1);
  g.input.rightDown = true;
  for (const dx of [407, 409, 411]) {
    aim(dx, sy - 1);
    for (let i = 0; i < 6; i++) { pin(); g.fixedUpdate(1 / 60); await raf(); }
  }
  g.input.rightDown = false;
  await step(3);
  const dragPlaced = [407, 409, 411].filter((x) => tile723At(x, sy - 1) >= 0).length;
  ck('(C) 按住拖过 3 点仅 1 桩（ItemsThatAllowRepeatedRightClick 排除→边沿门）',
    dragPlaced === 1, `placed=${dragPlaced} stack=${p.inv.slots[0]?.stack}`);

  // ---- D. 飞行态门：风筝弹在飞 → 右键不放置 ----
  // 先收掉 C 的桩拿回件（C 边沿门首点=407）
  spawned -= invKites();
  p.inv.slots[0] = null; await step(1);
  await press(407, sy - 1);                                  // 空手取回（清桩返件）
  await step(3);
  // 清场（掉落直接移出经济=同步减账）
  spawned -= dropKites();
  for (const d of g.entities.drops) if (!d.dead && items.ITEM_DEFS[d.itemId]?.vid === KITE_VID) d.dead = true;
  // 给 1 件，左键出膛（左键=放飞）
  give(1);
  aim(600, 200);
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 6; i++) { pin(); g.fixedUpdate(1 / 60); await raf(); }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const flying = g.entities.projectiles.filter((e) => e.constructor.name === 'KiteProj' && !e.dead).length;
  // 飞行中右键（指向地面有效点位）
  await press(413, sy - 1);
  ck('(D) 飞行态右键不放置（holdStyle≠0→StartChanneling 面）',
    flying === 1 && tile723At(413, sy - 1) < 0 && recAt(413, sy - 1) === undefined,
    `flying=${flying} tile=${tile723At(413, sy - 1)} stack=${p.inv.slots[0]?.stack}`);
  // 收线消亡
  g.input.rightDown = true;
  for (let i = 0; i < 80; i++) { pin(); g.fixedUpdate(1 / 60); await raf(); }
  g.input.rightDown = false;
  await step(3);

  // ---- E. 回收面：取回 → 线圈 tile 消失 + 恰返 1 ----
  give(1);                                                   // 挪到 415 射程内由 pinX 承载
  await step(20);
  R.trace.push(`E-pre: sel=${p.inv.selected} heldVid=${items.ITEM_DEFS[p.inv.heldItem()?.id ?? -1]?.vid} useTime=${p.useTime} flyK=${g.entities.projectiles.filter((e) => e.constructor.name === 'KiteProj' && !e.dead).length} px=${Math.floor(p.x / 16)}`);
  await press(415, sy - 1, 413);
  const placedBefore = tile723At(415, sy - 1) >= 0;
  R.trace.push(`E-post: placed=${placedBefore} useTime=${p.useTime} near=${[414, 415, 416].map((x) => tile723At(x, sy - 1)).join(',')} stack=${p.inv.slots[0]?.stack}`);
  spawned -= invKites();
  p.inv.slots[0] = null; await step(1);                      // 空手
  const dropsBefore = dropKites();
  await press(415, sy - 1, 413);                             // 右键取回
  const tileAfter = tile723At(415, sy - 1);
  const recAfter = recAt(415, sy - 1);
  const entAfter = entAt(415, sy - 1);
  const dropsAfter = dropKites();
  ck('(E) 取回：线圈 tile 消失+记录清+实体亡+恰返 1（原版回收路同态）',
    placedBefore && tileAfter < 0 && !recAfter && entAfter === 0 && dropsAfter === dropsBefore + 1,
    `tile=${tileAfter} rec=${!!recAfter} ent=${entAfter} drops ${dropsBefore}->${dropsAfter}`);

  // ---- F. 守恒面：全程经济总数 = 探针累计投放 spawned（放置消耗→桩存物,回收→掉落,
  //      无任何面净增/净减）----
  const anchorsStored = g.world.furnitureItems
    .filter((r) => r.kind === 'kite_anchor' && r.slots[0])
    .reduce((a, r) => a + r.slots[0].stack, 0);
  const accounted = total() + anchorsStored;
  R.trace.push(`F: inv=${invKites()} drops=${dropKites()} anchorsStored=${anchorsStored} accounted=${accounted} spawned=${spawned}`);
  ck('(F) 全程物品守恒（放置消耗+回收单返,无复制）', accounted === spawned,
    `accounted=${accounted} spawned=${spawned}`);

  // 截图（取回后场景 + 桩位现场）
  return R;
});
console.log(JSON.stringify(out, null, 1));
// 截图留档
const dir = '/Users/vinlic/Project/GLM/SandboxWorld/game/docs/evidence/bj426';
import { mkdirSync } from 'node:fs';
mkdirSync(dir, { recursive: true });
await page.screenshot({ path: dir + '/bj426-final-state.png' });
console.log('screenshot saved');
await browser.close();
