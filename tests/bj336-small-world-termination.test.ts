// ★BJ336（2026-09-24）：小世界挂死清偿判别面（BJ328 件4 家族第三发 + 沉降环守卫）。
//
// 复现定谳（证据链）：
//   ① 1200×850 生成真挂点 = CorruptionPass.runBranch 拒绝采样环（非 BJ328 判的
//      settleWaterAt）：非 UI 宽度 cx∈[num8,w-num8-1]=[500,699] 全域落在中央 ±200 带
//      内（mid=600）⇒ 拒绝空间为空、while(!ok) 永不终止。CDP inspector 栈实锤
//      （runBranch 忙循环，6 籽 100% 复现，见 tests/_bj336-qw-sweep.test.ts 留档）。
//      修=拒绝环 4w 次强制收口（同 BJ328 沙丘件4① 放松臂范式）。
//   ② settleWaterAt 沉降环实测健康：六籽 Underworld quickWater 全相 0.3s 内完成、
//      单调用外层迭代峰值 ≤104（理论界 h-3）、外层迭代总量 27-39 万——"非终止"系
//      BJ328 仪表误记。本刀仍按 BJ328 债面落终止性守卫（两环迭代硬帽=自然界 2 倍
//      余量，越界=不变量被未来改动破坏，按原版同拍截断语义就地落点）。
//
// 判别面：
//   - 腐化 1200×850 掷骰预算：放松臂在位=预算内完成；摘臂（变异）=预算爆红（快失败）。
//   - 腐化 4200×1200 对照：支持档预算内完成（放松臂数学不可达）。
//   - 地狱面 quickWater 1200×850：完成 + 守卫零触发 + 迭代预算 + 四通道哈希冻结
//     （终止性守卫对行为逐位不可见的直接锚）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { T, TILE_BY_KEY } from '../src/data/tiles';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import type { GenState } from '../src/world/gen/vanilla/GenState';

/** SW_BJ336=1：附加 4200 实尺零触发对照（~2-5s,避免全量套件常规负担） */
const HEAVY = process.env.SW_BJ336 === '1';

/** 掷骰计数/预算 rng（同 tests/bj328-dunes-tiny-world-termination 判别面范式） */
function wrapRng(seed: number, budget?: number): { rng: RNG; used: () => number } {
  const inner = new RNG(seed);
  let used = 0;
  const tick = (): void => {
    if (++used > (budget ?? Number.POSITIVE_INFINITY)) {
      throw new Error(`掷骰预算耗尽（>${budget}）=拒绝环未终止`);
    }
  };
  return {
    rng: {
      vanilla: inner.vanilla,
      next: () => { tick(); return inner.next(); },
      nextInt: (m: number) => { tick(); return inner.nextInt(m); },
      nextIntRange: (a: number, b: number) => { tick(); return inner.nextIntRange(a, b); },
      int: (a: number, b: number) => { tick(); return inner.int(a, b); },
      reseed: (s: number) => inner.reseed(s),
    } as unknown as RNG,
    used: () => used,
  };
}

/** runCorruptionPass 最小 GenState 面（非 dual/remix/tenth/ntb 普通种子只读这些） */
function tinyGenState(w: number, h: number, crimson: boolean): GenState {
  return {
    seed: 271828,
    seedFlags: {},
    crimson,
    dungeonSide: 0,
    dungeonLocation: Math.trunc(w * 0.08),
    worldSurface: Math.trunc(h * 0.21),
    worldSurfaceLow: Math.trunc(h * 0.21),
    rockLevel: Math.trunc(h * 0.45),
    undergroundDesert: undefined,
    evilZones: [],
  } as unknown as GenState;
}

function fnv1a(u8: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * 合成地狱面（Underworld 几何缩影,确定性）：底板实心 + 大腔体 + 灰烬台地/阶梯 +
 * 岩浆海 + 高位悬滴/水柱——覆盖长落、全宽蛇形、同型合并、水/岩浆相遇全路径。
 */
function buildHellWorld(w: number, h: number, seed: number): World {
  const world = new World(w, h, seed, 'bj336hell');
  const st = world.store;
  const rng = new RNG(seed);
  const ASH = T.ASH;
  const STONE = TILE_BY_KEY['stone']!;
  const idx = (x: number, y: number) => st.idx(x, y);
  // 侧壁 + 底板（实心）
  for (let x = 0; x < 6; x++) for (let y = 0; y < h; y++) { st.type[idx(x, y)] = STONE; st.flags[idx(x, y)] = 1; }
  for (let x = w - 6; x < w; x++) for (let y = 0; y < h; y++) { st.type[idx(x, y)] = STONE; st.flags[idx(x, y)] = 1; }
  for (let x = 0; x < w; x++) for (let y = h - 6; y < h; y++) { st.type[idx(x, y)] = STONE; st.flags[idx(x, y)] = 1; }
  // 地狱腔体（顶板以下全清）
  const cavTop = h - 150;
  for (let x = 6; x < w - 6; x++) for (let y = cavTop; y < h - 6; y++) { st.flags[idx(x, y)] = 0; st.type[idx(x, y)] = 0; st.wall[idx(x, y)] = 0; }
  // 灰烬台地/阶梯：随机实心 ASH 椭球（制造 shelves/overhang/落点壁架）
  for (let n = 0; n < Math.round(w / 24); n++) {
    const cx = 10 + rng.nextInt(w - 30);
    const cy = cavTop + 10 + rng.nextInt(h - 6 - cavTop - 20);
    const rw = 3 + rng.nextInt(26);
    const rh = 2 + rng.nextInt(5);
    for (let x = Math.max(6, cx - rw); x < Math.min(w - 6, cx + rw); x++) {
      for (let y = cy; y < Math.min(h - 6, cy + rh); y++) {
        if ((x - cx) * (x - cx) / (rw * rw) + (y - cy) * (y - cy) / (rh * rh) <= 1) {
          st.type[idx(x, y)] = ASH; st.flags[idx(x, y)] = 1; st.liquid[idx(x, y)] = 0;
        }
      }
    }
  }
  // 对角阶梯（液体逐 ledge 下行=外层多拍形态的构造面）
  for (let k = 0; k < 40; k++) {
    const x0 = 40 + k * Math.trunc((w - 90) / 40);
    const y0 = cavTop + 4 + k * 2;
    for (let x = x0; x < x0 + 26 && x < w - 6; x++) { st.type[idx(x, y0)] = ASH; st.flags[idx(x, y0)] = 1; }
  }
  // 岩浆海（腔底 60 行的非实心格注满）
  for (let x = 6; x < w - 6; x++) {
    for (let y = h - 70; y < h - 6; y++) {
      if (!st.flags[idx(x, y)]) { st.liquid[idx(x, y)] = 255; st.liquidType[idx(x, y)] = 2; }
    }
  }
  // 高位岩浆悬滴（长落形态）
  for (let n = 0; n < Math.round(w / 40); n++) {
    const x = 10 + rng.nextInt(w - 20);
    const y = cavTop + 2 + rng.nextInt(24);
    if (!st.flags[idx(x, y)]) { st.liquid[idx(x, y)] = 255; st.liquidType[idx(x, y)] = 2; }
  }
  // 高位水潭/水柱（水岩相遇 + 蛇形铺展形态）
  for (let n = 0; n < Math.round(w / 60); n++) {
    const cx = 12 + rng.nextInt(w - 24);
    const cy = cavTop - 60 + rng.nextInt(40);
    const cw = 4 + rng.nextInt(14);
    for (let x = cx; x < Math.min(w - 8, cx + cw); x++) {
      for (let y = cy; y < cy + 3; y++) {
        if (!st.flags[idx(x, y)] && y > 4 && y < h - 6) { st.liquid[idx(x, y)] = 255; st.liquidType[idx(x, y)] = 1; }
      }
    }
  }
  return world;
}

/** UnderworldPass(L76-114) 同款装配的 gen 模式 quickWater（接线以真实地狱相为准） */
function runHellQuickWater(world: World, seed: number): { oEvents: number; trips: number; ms: number } {
  const rng = new RNG(seed);
  const sim = new LiquidSim(world);
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.genWaterLine = Math.trunc(world.store.h * 0.55);
  sim.passRand = (max) => rng.nextInt(max);
  sim.passRng = rng;
  let oEvents = 0;
  LiquidSim.settleEv = (kind) => { if (kind === 'O') oEvents++; };
  const t0 = Date.now();
  try {
    sim.quickWater();
  } finally {
    LiquidSim.settleEv = null;
    sim.dispose();
  }
  return { oEvents, trips: sim.settleGuardTrips, ms: Date.now() - t0 };
}

describe('BJ336 件2a 腐化拒绝环·小宽度终止性', () => {
  it('1200×850：runCorruptionPass 在掷骰预算内完成（放松臂收口）', () => {
    const st = new TileStore(1200, 850);
    const { rng } = wrapRng(314159, 2_000_000);
    expect(() => runCorruptionPass(st, rng, tinyGenState(1200, 850, false))).not.toThrow();
  });

  it('4200×1200（UI 小档）：支持档完成且骰数在预算内（放松臂不可达对照）', () => {
    const st = new TileStore(4200, 1200);
    const { rng, used } = wrapRng(314159);
    expect(() => runCorruptionPass(st, rng, tinyGenState(4200, 1200, false))).not.toThrow();
    // t2 定谳：4200 腐化槽真骰 5.1M 量级——支持档放松臂若可达即为本支病理级偏差，
    // 预算给 3× 余量；摘臂变异对照下此数须逐位相等（同种子流不变性,见报告）。
    expect(used()).toBeLessThan(15_000_000);
  });
});

describe('BJ336 件2b 沉降环终止性守卫·零触发对照', () => {
  it('1200×850 地狱面 quickWater：完成+守卫零触发+迭代预算+四通道哈希冻结', () => {
    const world = buildHellWorld(1200, 850, 97531);
    const r = runHellQuickWater(world, 97531);
    expect(r.trips).toBe(0);
    expect(r.oEvents).toBeGreaterThan(0);
    expect(r.oEvents).toBeLessThan(6_000_000);
    const st = world.store;
    const hash = [st.liquid, st.liquidType, st.type, st.flags].map((a) =>
      fnv1a(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))).join(' ');
    // 冻结锚：守卫（迭代硬帽）对健康几何逐位不可见——哈希变红=守卫误触发或
    // 液体域被误改（液体金标域最高判据）。
    expect(hash).toBe('a46f2fb0 05849991 82b2ad05 ab08460d');
  }, 120000);

  it('220×260 微型面（液体金标同域）：守卫零触发对照', () => {
    const world = new World(220, 260, 424242, 'bj336tiny');
    const st = world.store;
    for (let x = 0; x < 220; x++) for (let y = 240; y < 260; y++) { st.type[st.idx(x, y)] = 2; st.flags[st.idx(x, y)] = 1; }
    for (let x = 40; x < 180; x++) for (let y = 200; y < 240; y++) { st.liquid[st.idx(x, y)] = 255; st.liquidType[st.idx(x, y)] = 2; }
    st.liquid[st.idx(110, 60)] = 255; st.liquidType[st.idx(110, 60)] = 1;   // 深井悬滴（长落）
    for (let y = 60; y < 200; y++) st.flags[st.idx(110, y)] = 0;             // 竖井
    const r = runHellQuickWater(world, 424242);
    expect(r.trips).toBe(0);
  });

  // SW_BJ336=1 门（4200 实尺面 ~2-5s,避免并行全量误跑）：
  // SW_BJ336=1 npx vitest run tests/bj336-small-world-termination.test.ts
  it.skipIf(!HEAVY)('4200×1200 地狱面 quickWater：守卫零触发（大世界实尺对照）', () => {
    const world = buildHellWorld(4200, 1200, 97531);
    const r = runHellQuickWater(world, 97531);
    expect(r.trips).toBe(0);
    expect(r.oEvents).toBeGreaterThan(0);
    expect(r.oEvents).toBeLessThan(40_000_000);
  }, 300000);
});
