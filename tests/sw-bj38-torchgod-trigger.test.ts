// SW-BJ38（2026-09-09）：火把神触发链法证批——浮点中心死读案。
// 实报：地下平台摆 75-90 支火把，事件永不触发。
// 定谳（1457 反编译锚，1458 同域核对零变更——Player.cs/Projectile.cs 行号偏移 1-2，
// SetDefaults 与触发链逐常量一致）：
//   触发门 Player.cs:18182-18199（1456 :17923-17939）：torchGodCooldown<=0
//   && !unlockedBiomeTorches && nearbyTorches>100 && !happyFunTorchTime
//   && position.Y>worldSurface*16 && 背包无 5043 → happyFunTorchTime=true。
//   计数窗基 = (int)Center/16 ±40（TryRecalculatingTorchLuck :17866-17871）——
//   原版对像素中心先取整再除 16。本仓 host.playerTile() 返回 cx/TILE 浮点
//   （Entity.cx=x+w/2 恒非整数），TorchGodEvent 曾把浮点直接喂 TileStore.idx
//   （y*w+x）→ 分数下标在 typed array 上读出 undefined → 全窗 0 计数 →
//   触发扫描死路（真实运行态恒不触发；旧测试夹具 ptile 全整数，掩盖本症）。
//   修复 = 扫描窗口基 Math.floor（对齐原版 (int) 截断）；弹 949 瞄准仍用浮点
//   中心（:18012 vector2=base.Center-vector，floor 会引入 ≤8px 瞄准偏移）。
//   死亡出口：KillMe :39155-39157（1456 :37764）EndOngoingTorchGodEvent——
//   本仓 settlePlayerDeath 原缺此接线，本批补 torchGod.abort()。
// 红蓝自审：本文件用例 1-3（浮点中心触发/阈值/窗界）在修复前必红（死读判别器），
//   用例 6（弹道瞄准浮点中心）在"顺手把 aim 也 floor"的错误修法下必红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import { TorchGodEvent, type TorchGodHost } from '../src/world/TorchGod';
import { T } from '../src/data/tiles';
import { TILE } from '../src/core/constants';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const W = 150, H = 150, SURFACE = 40;
// 真实运行态中心：Entity.cx = x + w/2（w=20 像素）→ cx/16 几乎恒为分数。
// 75.4 tile = cx 1206.4px；90.6 tile = cy 1449.6px。
const PX = 75.4, PY = 90.6;
const IPX = Math.floor(PX), IPY = Math.floor(PY);   // 原版 (int)Center/16 窗口基

function makeHarness(opts?: { unlocked?: boolean; holdingFavor?: boolean }) {
  const w = new World(W, H, 11, 'sw-bj38');
  w.groundLevel = SURFACE;
  for (let x = 0; x < W; x++) w.store.setTile(x, H - 4, 1);
  let unlocked = opts?.unlocked ?? false;
  let holdingFavor = opts?.holdingFavor ?? false;
  let ptile = { x: PX, y: PY };
  const bolts: Array<{ x: number; y: number; vx: number; vy: number; range: number; dust: number }> = [];
  const drops: Array<{ vid: number; x: number; y: number }> = [];
  const blackoutLog: boolean[] = [];
  const host: TorchGodHost = {
    store: w.store,
    worldSurface: w.groundLevel,
    playerTile: () => ptile,
    unlockedBiomeTorches: () => unlocked,
    hasVanillaItem: (vid) => vid === 5043 && holdingFavor,
    spawnTorchBolt: (x, y, vx, vy, range, dust) => bolts.push({ x, y, vx, vy, range, dust }),
    dropVanillaItem: (vid, px, py) => { drops.push({ vid, x: px, y: py }); },
    setBlackout: (on) => { blackoutLog.push(on); },
  };
  const ev = new TorchGodEvent(host);
  // 火把田（整数 tile 坐标；窗口内：cols IPX-30..IPX-19, rows IPY-30..IPY-22）
  const placeTorches = (n: number, style = 0, x0 = IPX - 30, y0 = IPY - 30) => {
    for (let k = 0; k < n; k++) {
      w.store.setTile(x0 + (k % 12), y0 + Math.floor(k / 12), T.TORCH, 0, style * 22);
    }
  };
  const setTorch = (x: number, y: number, style = 0) =>
    w.store.setTile(x, y, T.TORCH, 0, style * 22);
  const unlitTorches = () => {
    const out: Array<[number, number]> = [];
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
      const i = w.store.idx(x, y);
      if (w.store.flags[i] && w.store.type[i] === T.TORCH && w.store.frameX[i] >= 66) out.push([x, y]);
    }
    return out;
  };
  return { w, ev, bolts, drops, blackoutLog, placeTorches, setTorch, unlitTorches,
    set ptile(v: { x: number; y: number }) { ptile = v; } };
}

const gate = (h: ReturnType<typeof makeHarness>) => {
  for (let i = 0; i < 60; i++) h.ev.update();   // 60t 扫描节流（TorchGod.ts scanTick）
};

// ---------------------------------------------------------------------------
// 触发扫描（修复前 1-3 全红：浮点 idx 死读 → lit 恒 0）
// ---------------------------------------------------------------------------
describe('SW-BJ38 触发扫描：浮点中心窗口（Player.cs:17866-17871 (int)Center/16）', () => {
  it('实报同形：浮点 tile 中心 + 150 支点燃火把 → 必须触发（修复前恒不触发）', () => {
    const h = makeHarness();
    h.placeTorches(150);
    gate(h);
    expect(h.ev.active, '浮点中心下触发扫描必须数到火把（死读=恒 false）').toBe(true);
    expect(h.ev.attacks).toBe(0);          // numberOfTorchAttacksMade=0（:18196-18197）
  });

  it('阈值矩阵：100 支不触发 / 101 支触发（nearbyTorches > 100 严格大于 :18182）', () => {
    const h = makeHarness();
    h.placeTorches(100);
    gate(h);
    expect(h.ev.active, '100 支=阈值内（>100 才过）').toBe(false);
    h.setTorch(IPX + 30, IPY + 20);        // 第 101 支（异格,窗内）
    gate(h);
    expect(h.ev.active, '101 支 → 触发').toBe(true);
  });

  it('窗口边界：floor 中心 ±40 含边（行 +40 计数,行 +41 不计数 :17867-17868）', () => {
    const h = makeHarness();
    h.placeTorches(100);                   // rows IPY-30..IPY-22 全窗内
    // 窗基 floor(90.6)=90 → 行窗 [50,130];列窗 [35,115]
    h.setTorch(IPX + 41, IPY);             // 列 +41 → 窗外
    gate(h);
    expect(h.ev.active, '第 101 支在窗外（x+41 > floor+40）→ 仍 100 支不触发').toBe(false);
    h.w.store.setTile(0, 0, 0);            // 清掉窗外那支（type 0 = 空气）
    h.setTorch(IPX + 40, IPY);             // 挪到列 +40（恰在含边上）
    gate(h);
    expect(h.ev.active, '+40 含边计入 → 101 支触发').toBe(true);
  });

  it('层数门（浮点严格比较）：y=worldSurface+0.1 可触发,y=worldSurface 恰等不触发（:18182 position.Y>worldSurface*16）', () => {
    const below = makeHarness();
    below.placeTorches(101);
    below.ptile = { x: PX, y: SURFACE + 0.1 };
    gate(below);
    expect(below.ev.active, 'y>worldSurface 严格大于（地下 0.1 tile 即算）').toBe(true);

    const at = makeHarness();
    at.placeTorches(101);
    at.ptile = { x: PX, y: SURFACE };
    gate(at);
    expect(at.ev.active, 'y==worldSurface 恰等 → 门不过（严格大于）').toBe(false);
  });

  it('冷却门（浮点中心下复验）：abort 后 3600t 内不触发,耗尽后可再触发（torchGodCooldown :17855-17858/:17915）', () => {
    const h = makeHarness();
    h.placeTorches(101);
    gate(h);
    expect(h.ev.active).toBe(true);
    h.ev.abort();                          // EndOngoingTorchGodEvent 语义
    expect(h.ev.cooldown).toBe(3600);
    for (let i = 0; i < 3600; i++) h.ev.update();
    expect(h.ev.cooldown).toBe(0);
    gate(h);
    expect(h.ev.active, '冷却归零 → 可再触发').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 事件进行：弹 949 瞄准仍用浮点中心（:18012 base.Center）——floor 波及 aim 则此组红
// ---------------------------------------------------------------------------
describe('SW-BJ38 事件进行：aim 浮点中心 + 死亡出口 abort', () => {
  it('弹 949 方向 = 浮点玩家中心（p.x*16 不取整）;spawn 仍为火把顶 (x*16+8, y*16)（:18011-18016）', () => {
    const h = makeHarness();
    h.placeTorches(150, 9);                // 样式 9（冰炬）→ TORCH_DUST_BY_STYLE[9]
    gate(h);
    for (let i = 0; i < 21; i++) h.ev.update();
    expect(h.ev.attacks).toBe(1);
    expect(h.bolts.length).toBe(1);
    const b = h.bolts[0];
    const unlit = h.unlitTorches();
    expect(unlit.length).toBe(1);
    const [tx, ty] = unlit[0];
    const sx = tx * TILE + 8, sy = ty * TILE;
    // 原版 :18012-18014：vector2 = base.Center − vector（base.Center=浮点中心像素）
    const dx = PX * TILE - sx, dy = PY * TILE - sy;
    const len = Math.hypot(dx, dy);
    const spd = Math.hypot(b.vx, b.vy);
    expect(spd).toBeCloseTo(8, 5);                       // num7=8f（:18015）
    expect(b.vx / spd, 'vx 分量=浮点中心方向（若 aim 被 floor,dx 差 ≥1 tile）')
      .toBeCloseTo(dx / len, 3);
    expect(b.vy / spd).toBeCloseTo(dy / len, 3);
    expect(b.range).toBeCloseTo(len, 3);                 // ai[1]=发射时距离（:18014 num9）
  });

  it('abort()（EndOngoingTorchGodEvent :17834-17843）：active → 复燃+3600 冷却+blackout 关+无掉落;inactive → no-op', () => {
    const h = makeHarness();
    h.placeTorches(101);
    gate(h);
    for (let i = 0; i < 21; i++) h.ev.update();          // 首攻击轮：熄 1 支
    expect(h.unlitTorches().length).toBe(1);
    h.ev.abort();
    expect(h.ev.active).toBe(false);
    expect(h.ev.cooldown, 'RelightTorches 置 torchGodCooldown=3600（:17915）').toBe(3600);
    expect(h.unlitTorches().length, '批量复燃（frameX-=66 :17923）').toBe(0);
    expect(h.drops.length, '中止不掉 5043（无 RequestNewItem :17986-17989）').toBe(0);
    expect(h.blackoutLog[h.blackoutLog.length - 1]).toBe(false);
    // inactive no-op：冷却/blackout 不被误动
    h.ev.abort();
    expect(h.ev.cooldown).toBe(3600);                    // 不重置也不清零
  });
});

// ---------------------------------------------------------------------------
// 死亡出口接线（KillMe :39155-39157 EndOngoingTorchGodEvent → settlePlayerDeath）
// ---------------------------------------------------------------------------
describe('SW-BJ38 死亡出口：settlePlayerDeath → torchGod.abort()（KillMe :39155-39157）', () => {
  it('Game.settlePlayerDeath 含 torchGod.abort() 接线（源锚;原版在 lostCoins 后/DropItems 前）', () => {
    const gameSrc = readFileSync(ROOT + 'src/core/Game.ts', 'utf8');
    expect(gameSrc, 'KillMe :39155-39157 EndOngoingTorchGodEvent 接线')
      .toContain('torchGod?.abort()');
  });
});
