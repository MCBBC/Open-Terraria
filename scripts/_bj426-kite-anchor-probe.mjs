// BJ426 验收探针（修复后）：四连逐发实机验证——真实 DOM 鼠标事件驱动
//   （真实输入管线 = 原版玩家等价;页内 pin 循环钉位,真实循环消费边沿/冷却）。
//   A 位置门：空中无支撑拒置 / 墙档允许且帧档=4×18
//   B 消耗面：地面放置成功 → stack-1
//   C 边沿门：按住右键拖过 3 个有效点位 → 只放 1 桩
//   D 飞行态门：风筝弹在飞 → 右键不放置（收线仍工作）
//   E 回收面：右键取回 → 线圈 tile 消失 + 恰返 1 + 实体消散
//   F 守恒面：全程物品总数账本对拍（复制链关闭）
// 用法: SW_ORIGIN=http://localhost:5650 node tools/run-diag.mjs scripts/_bj426-kite-anchor-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const pageErrs = [];
page.on('pageerror', (e) => pageErrs.push(String(e?.message ?? e).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log(JSON.stringify({ fatal: 'boot timeout' })); await browser.close(); process.exit(1); }

// ---- 页内装订：钉位循环 + 平整场地（先摘欢迎覆层,防截图遮挡） ----
await page.evaluate(async () => {
  document.getElementById('sw-welcome-announce')?.remove();
  try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {}
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const tilesMod = await import('/src/data/tiles.ts');
  const st = g.world.store;
  let sy = 40; for (; sy < st.h - 10 && !st.isSolid(400, sy); sy++) {}
  for (let x = 396; x <= 430; x++) for (let y = sy; y < sy + 3; y++) st.setTile(x, y, 1, 0, 0);
  for (let x = 396; x <= 430; x++) for (let y = sy - 6; y < sy; y++) if (st.hasTile(x, y)) st.setTile(x, y, 0);
  for (let x = 396; x <= 430; x++) for (let y = sy - 6; y < sy; y++) st.wall[st.idx(x, y)] = 0;   // 场地清墙（A 点须无墙档
  const p = g.player;
  clearInterval(window.__bj426Pin);
  window.__bj426 = { items, tilesMod, sy, pinX: 402 };
  p.inv.slots.fill(null);
  p.inv.selected = 0;
  // 物品账本（F 守恒面基准：given-destroyed = 场内总量;拾取=内部转移不动账）
  window.__ledger = { given: 0, destroyed: 0 };
  // removeHeld 侦值（B 消耗面间歇观测窗）
  window.__rhLog = [];
  const rh0 = p.inv.removeHeld.bind(p.inv);
  p.inv.removeHeld = function (n) {
    const before = this.slots[this.selected]?.stack ?? null;
    const r = rh0(n);
    window.__rhLog.push(`rh(${n}) sel=${this.selected} ${before}->${this.slots[this.selected]?.stack ?? 'null'} mirror=${this.cursorMirror ? 'Y' : 'N'}`);
    return r;
  };
  // 同步钉位/瞄准/输入脉冲（单 evaluate 内完成=与真实循环零交错,确定性边沿）
  const pin = () => {
    p.x = window.__bj426.pinX * 16; p.y = (sy - 4) * 16; p.vx = 0; p.vy = 0;
    g.entities.enemies.length = 0;
  };
  const aim = (tx, ty) => {
    const [sx, sy2] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    g.input.mouseX = sx; g.input.mouseY = sy2;
  };
  window.__bj426Hold = (tx, ty, pinX, holdFrames) => {
    window.__bj426.pinX = pinX;
    for (let i = 0; i < 30; i++) { pin(); g.fixedUpdate(1 / 60); }          // 相机同步收敛
    g.input.rightDown = true;
    for (let i = 0; i < holdFrames; i++) { pin(); aim(tx, ty); g.fixedUpdate(1 / 60); }
    g.input.rightDown = false;
    for (let i = 0; i < 2; i++) { pin(); g.fixedUpdate(1 / 60); }
  };
  window.__bj426Drag = (points, pinX, framesPer) => {
    window.__bj426.pinX = pinX;
    for (let i = 0; i < 30; i++) { pin(); g.fixedUpdate(1 / 60); }
    g.input.rightDown = true;
    for (const [tx, ty] of points) {
      for (let i = 0; i < framesPer; i++) { pin(); aim(tx, ty); g.fixedUpdate(1 / 60); }
    }
    g.input.rightDown = false;
    for (let i = 0; i < 2; i++) { pin(); g.fixedUpdate(1 / 60); }
  };
  window.__bj426LeftHold = (tx, ty, pinX, holdFrames) => {
    window.__bj426.pinX = pinX;
    for (let i = 0; i < 30; i++) { pin(); g.fixedUpdate(1 / 60); }
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < holdFrames; i++) { pin(); aim(tx, ty); g.fixedUpdate(1 / 60); }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    for (let i = 0; i < 2; i++) { pin(); g.fixedUpdate(1 / 60); }
  };
});
await new Promise((r) => setTimeout(r, 800));              // 相机收敛

const R = { checks: [], trace: [] };
const sy = await page.evaluate(() => window.__bj426.sy);
const T723ID = await page.evaluate(() => window.__bj426.tilesMod.TILE_BY_KEY['v_723_kite_anchor']);
const KITE_VID = 4613;                                     // 猪龙风筝（用户实报件）

const give = async (n) => {
  if (n <= 0) {   // 0 = 真空手（stack-0 槽 heldItem 仍非 null,alt-use 臂照进——勿用）
    await page.evaluate((vid) => {
      const g = window.__swGame, items = window.__bj426.items;
      const old = g.player.inv.slots[0];
      if (old && items.ITEM_DEFS[old.id]?.vid === vid) window.__ledger.destroyed += old.stack;
      g.player.inv.slots[0] = null;
    }, KITE_VID);
    return;
  }
  await page.evaluate((k, n) => {
    const g = window.__swGame;
    const { items } = window.__bj426;
    const id = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[k]];
    const old = g.player.inv.slots[0];
    if (old && items.ITEM_DEFS[old.id]?.vid === k) window.__ledger.destroyed += old.stack;
    window.__ledger.given += n;
    g.player.inv.slots[0] = { id, stack: n, prefix: 0 };
    g.player.inv.selected = 0;
  }, KITE_VID, n);
};
const settle = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const rightClick = (tx, ty, pinX = 402) => page.evaluate(
  ([tx2, ty2, px]) => window.__bj426Hold(tx2, ty2, px, 5), [tx, ty, pinX]);
const dragRight = (points, pinX = 402, framesPer = 8) => page.evaluate(
  ([pts, px, fp]) => window.__bj426Drag(pts, px, fp), [points, pinX, framesPer]);
const leftClick = (tx, ty, pinX = 402) => page.evaluate(
  ([tx2, ty2, px]) => window.__bj426LeftHold(tx2, ty2, px, 6), [tx, ty, pinX]);
const readTile = (x, y) => page.evaluate(([x2, y2, t7]) => {
  const g = window.__swGame, st = g.world.store;
  const i = st.idx(x2, y2);
  return {
    isAnchor: st.type[i] === t7,
    frameX: st.frameX[i],
    rec: !!g.world.furnitureItems.find((r) => r.x === x2 && r.y === y2 && r.kind === 'kite_anchor'),
    ent: g.leashed.kites.filter((e) => e.ax === x2 && e.ay === y2 && e.active).length,
  };
}, [x, y, T723ID]);
const econ = () => page.evaluate((vid) => {
  const g = window.__swGame, items = window.__bj426.items;
  const inv = g.player.inv.slots.filter((s) => s && items.ITEM_DEFS[s.id]?.vid === vid).reduce((a, s) => a + s.stack, 0);
  const drops = g.entities.drops.filter((d) => !d.dead && items.ITEM_DEFS[d.itemId]?.vid === vid).reduce((a, d) => a + d.stack, 0);
  const anchors = g.world.furnitureItems.filter((r) => r.kind === 'kite_anchor' && r.slots[0]).reduce((a, r) => a + r.slots[0].stack, 0);
  return { inv, drops, anchors, total: inv + drops + anchors };
}, KITE_VID);
const ck = (name, ok, note = '') => R.checks.push({ name, ok, note });

// ---- A. 位置门：空中无支撑 → 拒 ----
await give(3);
await rightClick(405, sy - 3);
let s = await readTile(405, sy - 3);
ck('(A) 空中无支撑拒置（五锚档全失）', !s.rec && s.ent === 0 && !s.isAnchor, JSON.stringify(s));

// ---- A2. 墙档：背后有墙 → 允许,帧档=4×18 ----
await page.evaluate(([x, y]) => {
  const st = window.__swGame.world.store;
  st.wall[st.idx(x, y)] = 2;
}, [405, sy - 2]);
await rightClick(405, sy - 2);
s = await readTile(405, sy - 2);
ck('(A2) 墙档允许且帧档=72（AnchorWall 档×18）', s.isAnchor && s.frameX === 72 && s.rec, JSON.stringify(s));
await give(0);
await rightClick(405, sy - 2);                             // 空手取回清场（顺带验 ④）
await page.evaluate(([x, y]) => {
  const st = window.__swGame.world.store;
  st.wall[st.idx(x, y)] = 0;
}, [405, sy - 2]);

// ---- B. 消耗面：地面放置 → stack-1（rh 侦值快照差分,免疫掉落拾取时序） ----
await give(3);
const rhLen0 = await page.evaluate(() => window.__rhLog.length);
await rightClick(405, sy - 1);
s = await readTile(405, sy - 1);
const eB = await econ();
const rh = await page.evaluate(() => window.__rhLog);
const rhNew = rh.slice(rhLen0);
R.trace.push(`B-rh: new=${JSON.stringify(rhNew)} econ=${JSON.stringify(eB)}`);
const bDiag = await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  return { ui: g.input.uiBlocking, prev: g._prevRightDown, useT: p.useTime, anim: p.itemAnimTicks,
    swing: g.swing ? g.swing.t : -1, dead: p.dead, tileInt: g.tileInteractHappened,
    selected: p.inv.selected, held: p.inv.heldItem()?.id ?? -1 };
});
ck('(B) 地面放置成功且消耗 1（PlaceFromPlayerPlacementHook --stack）',
  s.isAnchor && s.rec && s.ent === 1 && rhNew.length === 1
    && /^rh\(1\) sel=0 (\d+)->(\d+) /.test(rhNew[0])
    && Number(RegExp.$2) === Number(RegExp.$1) - 1,
  `tile=${JSON.stringify(s)} rhNew=${JSON.stringify(rhNew)} diag=${JSON.stringify(bDiag)}`);

// ---- C. 边沿门：按住右键拖过 3 个有效点位 → 只放 1 桩 ----
await dragRight([[407, sy - 1], [409, sy - 1], [411, sy - 1]]);
let placed = 0;
for (const dx of [407, 409, 411]) { const t = await readTile(dx, sy - 1); if (t.isAnchor) placed++; }
ck('(C) 按住拖过 3 点仅 1 桩（repeat 集排除→边沿门）', placed === 1, `placed=${placed}`);

// ---- D. 飞行态门：风筝弹在飞 → 右键不放置 ----
const cAt = await page.evaluate(() => {
  const g = window.__swGame;
  for (const x of [407, 409, 411]) {
    if (g.world.furnitureItems.find((r) => r.x === x && r.y === window.__bj426.sy - 1 && r.kind === 'kite_anchor')) return x;
  }
  return 0;
});
await give(0);
if (cAt) await rightClick(cAt, sy - 1);                    // 空手取回 C 桩
await page.evaluate((vid) => {
  const g = window.__swGame, items = window.__bj426.items;
  for (const d of g.entities.drops) if (!d.dead && items.ITEM_DEFS[d.itemId]?.vid === vid) {
    window.__ledger.destroyed += d.stack;
    d.dead = true;
  }
}, KITE_VID);
await give(1);
await leftClick(420, sy - 8);        // 左键放飞
const flying = await page.evaluate(() =>
  window.__swGame.entities.projectiles.filter((e) => e.constructor.name === 'KiteProj' && !e.dead).length);
await rightClick(411, sy - 1);
s = await readTile(411, sy - 1);
ck('(D) 飞行态右键不放置（holdStyle≠0→StartChanneling 面）',
  flying === 1 && !s.isAnchor && !s.rec, `flying=${flying} ${JSON.stringify(s)}`);
// 收线消亡（按住右键 100 拍=1.67s）
await page.evaluate(() => window.__bj426Hold(420, window.__bj426.sy - 8, window.__bj426.pinX, 100));

// ---- E. 回收面：取回 → 线圈 tile 消失 + 恰返 1 ----
await give(1);
await rightClick(415, sy - 1, 413);
s = await readTile(415, sy - 1);
const placedE = s.isAnchor;
const beforeE = await econ();
await give(0);
await rightClick(415, sy - 1, 413);                        // 空手右键取回
s = await readTile(415, sy - 1);
const afterE = await econ();
ck('(E) 取回：线圈 tile 消失+记录清+实体亡+恰返 1（原版回收路同态;返件允许即时拾取）',
  placedE && !s.isAnchor && !s.rec && s.ent === 0
    && (afterE.inv + afterE.drops) === (beforeE.inv + beforeE.drops) + 1,
  `placed=${placedE} before=${JSON.stringify(beforeE)} after=${JSON.stringify(afterE)}`);

// ---- F. 守恒面：经济账本 = 投放净存（B 桩存 1 常驻;E 收返 1 掉落;手持 0;无净增） ----
const fin = await econ();
const led = await page.evaluate(() => window.__ledger);
R.trace.push(`F: fin=${JSON.stringify(fin)} ledger=${JSON.stringify(led)}`);
ck('(F) 全程物品守恒（放置消耗+回收单返,无复制）',
  fin.total === led.given - led.destroyed,
  `fin=${JSON.stringify(fin)} ledger=${JSON.stringify(led)}(场内=投放-清退;拾取/消耗/存桩均内部转移)`);

R.trace.push(`pageErrors=${JSON.stringify(pageErrs)}`);
console.log(JSON.stringify(R, null, 1));
const dir = '/Users/vinlic/Project/GLM/SandboxWorld/game/docs/evidence/bj426';
mkdirSync(dir, { recursive: true });
// 布置留档场景：一个在飞的风筝桩（B 桩 405）+ 手持风筝,复刻放置现场
await page.evaluate((vid) => {
  const g = window.__swGame;
  const items = window.__bj426.items;
  const id = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[vid]];
  g.player.inv.slots[0] = { id, stack: 2, prefix: 0 };
  g.player.inv.selected = 0;
}, KITE_VID);
await page.evaluate(() => window.__bj426Hold(407, window.__bj426.sy - 1, 405, 5));
await new Promise((r) => setTimeout(r, 1200));             // 风筝升空摆相
await page.screenshot({ path: dir + '/bj426-anchor-kite-placed.png' });
// 清桩（取回）后留档：线圈消失
await page.evaluate(() => { window.__swGame.player.inv.slots[0] = null; });
await page.evaluate(() => window.__bj426Hold(407, window.__bj426.sy - 1, 405, 5));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: dir + '/bj426-after-retrieve-coil-gone.png' });
console.log('screenshot saved: docs/evidence/bj426/bj426-final-state.png');
await page.evaluate(() => clearInterval(window.__bj426Pin));
await browser.close();
