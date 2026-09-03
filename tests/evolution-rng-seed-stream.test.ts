// ★W1/NB-F（2026-09-03）：蔓延 RNG 源对齐 keyed 世界种子流。
//
// 原版事实（Terarria1457 实证）：
// · Main.Update → `using (Main.SwapRandom("UpdateWorldGen")) { UpdateWorld_WorldGenAndInvasion(); }`
//  （Main.cs:17985-17988）——UpdateWorld 全部采样/掷骰在该作用域内消费 Main.rand；
// · SwapRandom（Main.cs:3300-3312）：按 key 惰性 `new UnifiedRandom(ActiveWorldFileData.Seed)`
//  建【命名流】存 _rngs 表——**跨 tick 持续、每 tick 不重置**；
// · WorldGen.genRand ⇒ Main.rand（WorldGen.cs:4362 直别名）。
// 本仓等价：WorldEvolution 构造时 `new RNG(host.seed)` 专用实例，106 处 Math.random()
// 活流偏差全部改走 this.rng()；本文件钉：
//  ① 同 seed 同 tick 数两次跑蔓延 → 全通道逐位相同（任务验收口径）；
//  ② 流跨 tick 持续（第 2 tick 掷流 ≠ 第 1 tick——若每 tick 重置则两段逐位相同）；
//  ③ 流由 seed 决定：同 seed 两实例同序、异 seed 异序（genRand 别名语义）。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;

const W = 1200, H = 800;
const WS = 300;   // worldSurface（host 同值）

/** 特化迷你世界：覆盖蔓延主消费面（草/邪恶草/丛林/蘑菇/雪/苔藓+长苔藓/水+睡莲/藤/药草） */
function makeWorld(): TileStore {
  const st = new TileStore(W, H);
  for (let x = 0; x < W; x++) {
    for (let y = WS; y < WS + 3; y++) st.setTileSilent(x, y, S(2));            // 草皮
    for (let y = WS + 3; y < WS + 20; y++) st.setTileSilent(x, y, S(0));       // 泥土
    for (let y = WS + 20; y < H - 40; y++) st.setTileSilent(x, y, S(1));       // 石
    for (let y = H - 40; y < H; y++) st.setTileSilent(x, y, S(57));            // 灰烬
  }
  // 邪恶带（腐化草+邪石）/ 丛林带 / 蘑菇带 / 雪带
  for (let x = 500; x < 560; x++) {
    st.setTileSilent(x, WS, S(23));
    st.setTileSilent(x, WS + 6, S(25));
  }
  for (let x = 700; x < 780; x++) {
    for (let y = WS; y < WS + 12; y++) st.setTileSilent(x, y, S(59));          // 泥
    st.setTileSilent(x, WS, S(60));                                            // 丛林草
  }
  for (let x = 900; x < 940; x++) {
    for (let y = WS; y < WS + 8; y++) st.setTileSilent(x, y, S(59));
    st.setTileSilent(x, WS, S(70));                                            // 蘑菇草
  }
  for (let x = 200; x < 260; x++) {
    st.setTileSilent(x, WS, S(147));                                           // 雪块
    for (let y = WS + 1; y < WS + 8; y++) st.setTileSilent(x, y, S(161));      // 冰
  }
  // 石带洞穴腔：空腔+腔底泥+苔藓块/长苔藓+水池+睡莲+腔顶丛林草垂藤+药草
  for (let c = 0; c < 40; c++) {
    const cx = 60 + c * 28;
    const cy = WS + 40 + (c % 7) * 60;
    for (let dx = -6; dx <= 6; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        if (Math.abs(dx) + Math.abs(dy) > 8) continue;
        st.setTileSilent(cx + dx, cy + dy, 0);
      }
    }
    for (let dx = -6; dx <= 6; dx++) st.setTileSilent(cx + dx, cy + 5, S(59)); // 腔底泥
    st.setTileSilent(cx, cy + 4, S(182));                                      // 苔藓块
    st.setTileSilent(cx, cy + 3, S(184), 22 * 3, 0);                           // 长苔藓（垂苔）
    const wx = c % 2 === 0 ? cx - 3 : cx + 3;
    for (let dy = -3; dy <= 3; dy++) {
      st.setTileSilent(wx, cy + dy, 0);
      st.liquid[st.idx(wx, cy + dy)] = 255;
      st.liquidType[st.idx(wx, cy + dy)] = 1;
    }
    st.setTileSilent(wx, cy - 4, S(518), 0, 0);                                // 睡莲浮水面
    st.setTileSilent(cx + 2, cy - 5, S(60));                                   // 腔顶丛林草
    st.setTileSilent(cx + 2, cy - 4, S(62));                                   // 丛林藤
    st.setTileSilent(cx - 2, cy + 4, S(82));                                   // 药草芽（style0）
    if (c % 4 === 1) st.setTileSilent(cx + 4, cy + 4, S(25));                  // 腔底邪石（邪恶蔓延源）
  }
  // 地表点缀：植物/药草/向日葵
  for (let x = 20; x < W - 20; x += 13) {
    if (x >= 500 && x < 560) { st.setTileSilent(x, WS - 1, S(24)); continue; }
    st.setTileSilent(x, WS - 1, S(3));
  }
  for (let x = 30; x < W - 30; x += 47) st.setTileSilent(x, WS - 1, S(82));
  for (let x = 40; x < W - 40; x += 91) st.setTileSilent(x, WS - 1, S(27));
  return st;
}

function makeEvo(st: TileStore, seed: number): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed,                                                   // ★NB-F：蔓延专用持久流
    worldSurface: WS + 4,            // 采样带上界=ws-2（原版 Next(10, (int)ws-1)）→ 抬 4 使草皮/植物入带
    rockLevel: 500, dungeonX: 600, difficulty: 0,
    flags: {}, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
  };
  return new WorldEvolution(host);
}

type Snap = {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; fx: Uint16Array; fy: Uint16Array;
};
function snap(st: TileStore): Snap {
  return {
    type: st.type.slice(), flags: st.flags.slice(), wall: st.wall.slice(),
    liquid: st.liquid.slice(), liquidType: st.liquidType.slice(),
    fx: st.frameX.slice(), fy: st.frameY.slice(),
  };
}
function diffCount(a: Snap, b: Snap): number {
  let d = 0;
  for (const k of Object.keys(a) as Array<keyof Snap>) {
    const va = a[k] as ArrayLike<number>, vb = b[k] as ArrayLike<number>;
    for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) d++;
  }
  return d;
}

/** 蔓延流观察（core/rng.ts __swOnRoll 观察钩：观测不消费）——按流实例过滤 */
function captureRolls(evo: WorldEvolution, fn: () => void): number[] {
  const stream = (evo as unknown as { spreadRng: RNG }).spreadRng.vanilla;
  const out: number[] = [];
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const prev = g.__swOnRoll;
  g.__swOnRoll = (v, inst) => { if (inst === stream) out.push(v); };
  try { fn(); } finally { g.__swOnRoll = prev; }
  return out;
}

afterEach(() => {
  const g = globalThis as { __swOnRoll?: unknown };
  delete g.__swOnRoll;
  vi.restoreAllMocks();
});

describe('W1 蔓延 RNG 源：keyed 世界种子持久流', () => {
  it('① 同 seed 同 tick 数两次跑蔓延 → 全通道逐位相同', () => {
    const stA = makeWorld(), stB = makeWorld();
    const a = makeEvo(stA, 20260903), b = makeEvo(stB, 20260903);
    for (let t = 0; t < 240; t++) { a.update(); b.update(); }
    expect(diffCount(snap(stA), snap(stB))).toBe(0);
    // 且世界确实演化过（非双双零动作的空过）
    expect(diffCount(snap(makeWorld()), snap(stA))).toBeGreaterThan(0);
  });

  it('② 流跨 tick 持续：第 2 tick 首掷 ≠ 第 1 tick 首掷（每 tick 重置则首掷必相同）', () => {
    const evo = makeEvo(makeWorld(), 77);
    const r1 = captureRolls(evo, () => evo.update());
    const r2 = captureRolls(evo, () => evo.update());
    const r3 = captureRolls(evo, () => evo.update());
    expect(r1.length).toBeGreaterThan(16);
    expect(r2.length).toBeGreaterThan(16);
    // ★判别式：若 update() 每 tick reseed，则 r2[0] 必然 === r1[0]（同流第 0 掷）。
    //  持续流语义下 r2[0] 是第 (|r1|+1) 个样本——与 r1[0] 撞值概率 1/2^31，可忽略。
    expect(r2[0]).not.toBe(r1[0]);
    expect(r3[0]).not.toBe(r1[0]);
    expect(r3[0]).not.toBe(r2[0]);
    expect(r1).not.toEqual(r2);
  });

  it('③ 流由 seed 决定：同 seed 两实例同序、异 seed 异序（genRand 别名语义）', () => {
    const a = makeEvo(makeWorld(), 424242), b = makeEvo(makeWorld(), 424242);
    const c = makeEvo(makeWorld(), 424243);
    const ra = captureRolls(a, () => a.update());
    const rb = captureRolls(b, () => b.update());
    const rc = captureRolls(c, () => c.update());
    expect(ra.length).toBeGreaterThan(16);
    expect(ra).toEqual(rb);          // 同 seed 同序
    expect(ra).not.toEqual(rc);      // 异 seed 异序
  });
});
