// BJ623 提炼机电线触发不提炼——用户场景实况探针（定谳用,一次性）。
// 场景复刻（图 96）：提炼机 3×3 + 正上方箱（雪泥×2×5,真实内部 id 走 slotVanillaId 桥）
//   + 1 秒计时器 + 红线（计时器→提炼机左列格）。分站计数定位断点：
//   A 全链(hitSwitch 开计时器→updateMech 250t)  B tripWire 直打提取机格  C pullImpl 直调
//   D 静态面(wire 覆盖/sheet/vid 桥)  E 手动交互回归(手持雪泥对准提取机)
// 用法：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj623-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260909 });

await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = window.__swTiles;
  const ptx = Math.floor(g.player.x / 16);
  const surface = (() => {
    for (let y = 5; y < st.h; y++) if (st.flags[st.idx(ptx, y)] !== 0) return y;
    return Math.floor(st.h * 0.3);
  })();
  const ax = ptx + 6, ay = surface + 2;
  // 清场 17×13
  for (let dy = -7; dy <= 6; dy++) {
    for (let dx = -9; dx <= 9; dx++) {
      const x = ax + dx, y = ay + dy;
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      st.type[i] = 0; st.flags[i] = 0; st.wire[i] = 0; st.wall[i] = 0;
      st.half[i] = 0; st.slope[i] = 0;
      if (st.liquid) st.liquid[i] = 0;
    }
  }
  window.__BJ = { ax, ay };
  // 提取机 3×3
  const T219 = T['v_219_extractinator'];
  for (let cx = 0; cx < 3; cx++) {
    for (let cy = 0; cy < 3; cy++) st.setTileSilent(ax + cx, ay + cy, T219, cx * 18, cy * 18);
  }
  // 箱 2×2（普通 chest tile;锚=提取机锚正上 2 行=扫描框内边界行）
  const TCHEST = T['chest'];
  for (let cx = 0; cx < 2; cx++) {
    for (let cy = 0; cy < 2; cy++) st.setTileSilent(ax + cx, ay - 2 + cy, TCHEST, cx * 18, cy * 18);
  }
  const chest = { x: ax, y: ay - 2, items: Array(40).fill(null) };
  g.world.chests.push(chest);
  window.__BJchest = chest;
  // 雪泥（真实内部 id;ITEM_DEFS vid 桥验）
  const slushId = window.__swItems['vi_1103_slush_block'];
  window.__BJslushVid = window.__swITEM_DEFS[slushId]?.vid;
  chest.items[39] = { id: slushId, stack: 5 };
  chest.items[38] = { id: slushId, stack: 5 };
  // 计时器 1s（frameX=0）在提取机左侧 3 格同行
  const T144 = T['v_144_timers'];
  const tx = ax - 3, ty = ay;
  st.setTileSilent(tx, ty, T144, 0, 0);
  window.__BJtimer = [tx, ty];
  // 红线：计时器格 → 提取机左列格 (ax, ay)
  for (let x = tx; x <= ax; x++) g.wiring.placeWire(x, ty, 1);
  // 分站计数：包 device
  const orig = g.wiring.device;
  window.__BJhits = { dev219: 0, devCells: [] };
  g.wiring.device = (w, sheet, x, y) => {
    if (sheet === 219 || sheet === 642) { window.__BJhits.dev219++; window.__BJhits.devCells.push([x, y]); }
    return orig(w, sheet, x, y);
  };
  window.__BJdrop0 = g.entities.drops.length;
});

await pump(page, 10);

// ---- 站 A：全链——hitSwitch 开计时器,pump 250 tick ----
await page.evaluate(() => {
  const g = window.__swGame;
  const [tx, ty] = window.__BJtimer;
  g.wiring.hitSwitch(tx, ty);
  window.__BJtimerOn = g.world.store.frameY[g.world.store.idx(tx, ty)];
});
await pump(page, 250);
const stageA = await page.evaluate(() => {
  const g = window.__swGame;
  const chest = window.__BJchest;
  return {
    timerOn: window.__BJtimerOn,
    hits: window.__BJhits,
    chestTail: chest.items[39], chestPrev: chest.items[38],
    dropsDelta: g.entities.drops.length - window.__BJdrop0,
    dropSample: g.entities.drops.slice(-6).map((d) => ({ vid: window.__swITEM_DEFS[d.itemId]?.vid, stack: d.stack, x: Math.round(d.x / 16), y: Math.round(d.y / 16) })),
    mechCount: g.wiring.activeMechCount?.(),
  };
});

// ---- 站 B：tripWire 直打提取机（隔离计时器链）----
const stageB = await page.evaluate(() => {
  const g = window.__swGame;
  const chest = window.__BJchest;
  const { ax, ay } = window.__BJ;
  const before = JSON.stringify(chest.items[39]);
  g.wiring.tripWire(ax, ay, 1, 1);      // 有红线的提取机左上格
  return { before, after: JSON.stringify(chest.items[39]), hits: window.__BJhits.dev219 };
});

// ---- 站 C：extractinatorPullImpl 直调（隔离 BFS/器件表）----
const stageC = await page.evaluate(() => {
  const g = window.__swGame;
  const chest = window.__BJchest;
  const { ax, ay } = window.__BJ;
  const out = g.extractinatorPullImpl(ax, ay, 219);
  return {
    pullOut: out,
    chestTail: chest.items[39],
    chestAnchors: g.world.chests.slice(-4).map((c) => [c.x, c.y, (c.items ?? []).filter(Boolean).length]),
  };
});

// ---- 站 D：静态面 ----
const stageD = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const { ax, ay } = window.__BJ;
  const [tx, ty] = window.__BJtimer;
  return {
    sheetExtract: [g.wiring.sheetOf(ax, ay), g.wiring.sheetOf(ax + 1, ay + 1)],
    wireOnExtract: [st.wire[st.idx(ax, ay)] & 1, st.wire[st.idx(ax + 1, ay + 1)] & 1],
    sheetTimer: g.wiring.sheetOf(tx, ty),
    wireOnTimer: st.wire[st.idx(tx, ty)] & 1,
    deviceAttached: !!g.wiring.device,
    slushVid: window.__BJslushVid,
  };
});

console.log('BJ623-A(全链250t)', JSON.stringify(stageA));
console.log('BJ623-B(tripWire直打)', JSON.stringify(stageB));
console.log('BJ623-C(pullImpl直调)', JSON.stringify(stageC));
console.log('BJ623-D(静态面)', JSON.stringify(stageD));
await browser.close();
