// SW-RB9a（2026-09-09）：SW-BJ38 红队复审补刀——四项门锚/容量偏差 + 两项本相锁。
// 反编译锚（1457=1458 同域,1456 同值）：
//   F1 收集容量：TorchAttack 攻击盒收集容量 = _torchAttackPosX.Length = 400
//      （Player.cs:3063;1456 :2944;1458 :3063）≠ maxTorchAttacks=200（:3057 攻击
//      上限,另一常量）。BJ38 曾以 200 兼任收集容量——盒内 >200 支点燃时候选集
//      （列序收集,西→东）被削到前 200,随机熄炬分布/终幕 num==1 相位全偏。
//   F2 触发门锚：Player.cs:18182 `(double)position.Y > Main.worldSurface*16.0`
//      ——position.Y = hitbox 顶边（Entity 左上）,非 Center。中心锚把门界下移
//      h/2=21px（1.3125 tile）：头还在地表线上方（top<ws*16 但 center>ws*16）时
//      原版不触发,仓库曾触发。
//   F3 中止门锚：TorchAttack :17934 `(double)position.Y < Main.worldSurface*16.0`
//      同为顶边严格小于——中心锚令升表中止晚 21px。
//   F4 死亡态门：TryRecalculatingTorchLuck :17860 `| (dead ? 1u : 0u)` 进 Consume
//      早退——dead 分支不再扫窗,nearbyTorches 于 :18203 每轮清零 → 死中永不触发;
//      仓库死屏 update() 照跑,曾可在死屏触发事件。
//   本相锁 A：触发块 :18195-18197 只置 happyFunTorchTime=true /
//      numberOfTorchAttacksMade=0——torchFunTimer 无触发位重置（上事件残留值带进
//      下事件）。BJ38 曾 funTimer=0 清零=首轮攻击时序偏差。
//   本相锁 B：冷却递减（:17855-17858）在 dead 早退【前】——死中冷却照走。
// 变异判别力：F1 用 Math.random→0.9999999（取候选集末位）;F2/F3 用顶边=中心−1.3125
//   的几何桩;F4 用 dead 桩;A 用 10t 残留相位——修复前逐项必红（见提交前变异记录）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TorchGodEvent, type TorchGodHost } from '../src/world/TorchGod';
import { T } from '../src/data/tiles';

const W = 150, H = 150, SURFACE = 40;
const PX = 75.4, PY = 90.6;                       // 真实运行态浮点中心（Entity.cx=x+w/2）
const IPX = Math.floor(PX), IPY = Math.floor(PY);
const TOP_OFFSET = 1.3125;                        // Player.height=42px → 中心−顶边=21px/16

function makeHarness(opts?: { topOffsetTiles?: number }) {
  const w = new World(W, H, 11, 'sw-rb9a');
  w.groundLevel = SURFACE;
  for (let x = 0; x < W; x++) w.store.setTile(x, H - 4, 1);
  let unlocked = false;
  let holdingFavor = false;
  let dead = false;
  let ptile = { x: PX, y: PY };
  // 顶边=中心−TOP_OFFSET（真实几何:hitbox 顶边在中心上方 21px）;opts 可自定义偏移
  const topOff = opts?.topOffsetTiles ?? TOP_OFFSET;
  const bolts: Array<{ x: number; y: number; vx: number; vy: number; range: number; dust: number }> = [];
  const drops: Array<{ vid: number; x: number; y: number }> = [];
  const host: TorchGodHost = {
    store: w.store,
    worldSurface: w.groundLevel,
    playerTile: () => ptile,
    playerTopY: () => ptile.y - topOff,
    dead: () => dead,
    unlockedBiomeTorches: () => unlocked,
    hasVanillaItem: (vid) => vid === 5043 && holdingFavor,
    spawnTorchBolt: (x, y, vx, vy, range, dust) => bolts.push({ x, y, vx, vy, range, dust }),
    dropVanillaItem: (vid, px, py) => { drops.push({ vid, x: px, y: py }); },
    setBlackout: () => {},
  };
  const ev = new TorchGodEvent(host);
  const placeTorch = (x: number, y: number, style = 0) =>
    w.store.setTile(x, y, T.TORCH, 0, style * 22);
  const unlitTorches = () => {
    const out: Array<[number, number]> = [];
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
      const i = w.store.idx(x, y);
      if (w.store.flags[i] && w.store.type[i] === T.TORCH && w.store.frameX[i] >= 66) out.push([x, y]);
    }
    return out;
  };
  return { w, ev, bolts, drops, placeTorch, unlitTorches,
    set ptile(v: { x: number; y: number }) { ptile = v; },
    get ptile() { return ptile; },
    set dead(v: boolean) { dead = v; } };
}

const gate = (h: ReturnType<typeof makeHarness>) => {
  for (let i = 0; i < 60; i++) h.ev.update();
};

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// F1 收集容量 400（Player.cs:3063）——变异：COLLECT_CAP 400→200 必红
// ---------------------------------------------------------------------------
describe('SW-RB9a F1：攻击盒收集容量=_torchAttackPosX.Length=400（:3063）', () => {
  it('候选集含 251 支时随机末位可命中东缘第 251 支（收集 200 短容下恒不命中）', () => {
    const h = makeHarness();
    // 块 A：250 支（10 列 × 25 行,列序收集占 idx 0..249）;块 B：东缘 (IPX+40, IPY)=idx 250
    for (let k = 0; k < 250; k++) {
      h.placeTorch(IPX - 40 + Math.floor(k / 25), IPY - 40 + (k % 25));
    }
    h.placeTorch(IPX + 40, IPY);
    gate(h);
    expect(h.ev.active).toBe(true);
    // 取候选集【末位】：Math.random→0.9999999 → idx=floor(0.9999999×N)=N−1
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.9999999);
    for (let i = 0; i < 21; i++) h.ev.update();
    spy.mockRestore();
    expect(h.ev.attacks).toBe(1);
    // 容量 400：末位=块 B (IPX+40,IPY)；容量 200（变异）：末位=块 A 末支
    // (IPX−33, IPY−16)——本断言在短容下必红
    expect(h.unlitTorches(), '第 251 支（东缘）必须进候选集（:3063 收集容量 400）')
      .toEqual([[IPX + 40, IPY]]);
  });
});

// ---------------------------------------------------------------------------
// F2/F3 触发/中止门锚=position.Y 顶边（:18182/:17934）——变异：门读中心必红
// ---------------------------------------------------------------------------
describe('SW-RB9a F2/F3：门锚=hitbox 顶边（position.Y,非 Center）', () => {
  it('F2 触发门：顶边在地表线上方（top<ws）时中心虽已过线也不触发（:18182）', () => {
    const h = makeHarness();
    h.placeTorch; // noop 引用防 lint（下方用 101 支）
    for (let k = 0; k < 101; k++) {
      h.placeTorch(IPX - 30 + (k % 12), IPY - 30 + Math.floor(k / 12));
    }
    // 中心=ws+0.5（旧中心锚：过线→触发）;顶边=ws+0.5−1.3125=ws−0.8125（顶边未过线）
    h.ptile = { x: PX, y: SURFACE + 0.5 };
    gate(h);
    expect(h.ev.active, '顶边 position.Y ≤ worldSurface*16 → 不触发（:18182 门锚=顶边）')
      .toBe(false);
    // 对照：顶边刚过线（top=ws+0.1>ws）→ 触发（锁门锚方向）
    const h2 = makeHarness();
    for (let k = 0; k < 101; k++) {
      h2.placeTorch(IPX - 30 + (k % 12), IPY - 30 + Math.floor(k / 12));
    }
    h2.ptile = { x: PX, y: SURFACE + 0.1 + TOP_OFFSET };
    gate(h2);
    expect(h2.ev.active).toBe(true);
  });

  it('F3 中止门：事件中顶边升回地表线上方（top<ws）即中止,中心虽仍在地下（:17934）', () => {
    const h = makeHarness();
    for (let k = 0; k < 101; k++) {
      h.placeTorch(IPX - 30 + (k % 12), IPY - 30 + Math.floor(k / 12));
    }
    gate(h);
    expect(h.ev.active).toBe(true);
    // 顶边=ws−0.5（<ws → 原版立即 EndOngoing）;中心=ws+0.8125（旧中心锚：仍>ws → 不中止）
    h.ptile = { x: PX, y: SURFACE - 0.5 + TOP_OFFSET };
    h.ev.update();
    expect(h.ev.active, 'position.Y < worldSurface*16 → EndOngoingTorchGodEvent（:17934）')
      .toBe(false);
    expect(h.unlitTorches().length, '中止=RelightTorches 全复燃（无掉落）').toBe(0);
  });

  it('严格不等号本相：top==ws 恰等时既不触发也不中止（:18182 严格>:17934 严格<）', () => {
    const h = makeHarness();
    for (let k = 0; k < 101; k++) {
      h.placeTorch(IPX - 30 + (k % 12), IPY - 30 + Math.floor(k / 12));
    }
    // 先在深处触发
    h.ptile = { x: PX, y: PY };
    gate(h);
    expect(h.ev.active).toBe(true);
    // top 恰 = ws（中心=ws+1.3125）：不中止（<ws 才中止）
    h.ptile = { x: PX, y: SURFACE + TOP_OFFSET };
    h.ev.update();
    expect(h.ev.active, 'top==ws 恰等：<ws 不成立 → 事件继续（严格小于）').toBe(true);
    // 触发门对称面：top==ws 恰等不触发（>ws 才过）
    const h2 = makeHarness();
    for (let k = 0; k < 101; k++) {
      h2.placeTorch(IPX - 30 + (k % 12), IPY - 30 + Math.floor(k / 12));
    }
    h2.ptile = { x: PX, y: SURFACE + TOP_OFFSET };
    gate(h2);
    expect(h2.ev.active, 'top==ws 恰等：>ws 不成立 → 不触发（严格大于）').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F4 死亡态门（:17860 dead 早退）+ 本相锁 B（冷却在 dead 前递减 :17855）
// ---------------------------------------------------------------------------
describe('SW-RB9a F4：死亡态永不触发;冷却递减不受 dead 影响', () => {
  it('dead=true 时 101 支火把不触发事件（原版死中 Consume 早退）', () => {
    const h = makeHarness();
    h.dead = true;
    for (let k = 0; k < 101; k++) {
      h.placeTorch(IPX - 30 + (k % 12), IPY - 30 + Math.floor(k / 12));
    }
    gate(h);
    expect(h.ev.active, 'dead → :17860 早退,nearbyTorches 恒 0 → 永不触发').toBe(false);
  });

  it('本相锁 B：dead=true 期间冷却照常逐 tick 递减（:17855 在 dead 早退前）', () => {
    const h = makeHarness();
    h.dead = true;
    // 直接灌冷却（abort 需 active,这里借 end 的置位面——经私有字段等价灌入）
    for (let i = 0; i < 100; i++) h.ev.update();
    (h.ev as unknown as { cooldown: number }).cooldown = 100;
    for (let i = 0; i < 100; i++) h.ev.update();
    expect((h.ev as unknown as { cooldown: number }).cooldown, '冷却逐 tick 递减到 0')
      .toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 本相锁 A：触发块不重置 torchFunTimer（:18195-18197 只置两字段）——变异：删残留
// 相位（恢复 funTimer=0）必红
// ---------------------------------------------------------------------------
describe('SW-RB9a A：torchFunTimer 无触发位重置（残留相位带进下事件）', () => {
  it('abort 时 funTimer=10 → 下事件第 11 tick 即首轮攻击（原版本相,非第 21）', () => {
    const h = makeHarness();
    for (let k = 0; k < 101; k++) {
      h.placeTorch(IPX - 30 + (k % 12), IPY - 30 + Math.floor(k / 12));
    }
    gate(h);
    expect(h.ev.active).toBe(true);
    for (let i = 0; i < 10; i++) h.ev.update();      // funTimer=1..10（无攻击）
    h.ev.abort();                                     // EndOngoing（冷却 3600）
    for (let i = 0; i < 3600; i++) h.ev.update();     // 烧完冷却
    gate(h);                                          // 再触发
    expect(h.ev.active).toBe(true);
    // funTimer 残留 10 → 11 tick 后达 21 → 首轮攻击（funTimer=0 清零变异：21 tick
    // 才首轮,此处 attacks===0 → 红）
    for (let i = 0; i < 11; i++) h.ev.update();
    expect(h.ev.attacks, 'funTimer 残留 10 → 11 tick 即首轮攻击（:18195 无 funTimer 重置）')
      .toBe(1);
  });
});
