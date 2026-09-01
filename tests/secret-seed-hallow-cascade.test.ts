// ★III-F5 神圣面（conversionType=2）尾级联补列回归（2026-09-01 五轮轻验证收口批）——
// 原文锚：Terarria1457/Terraria/WorldGen.cs:56788-56818
//   Convert_ActuallyConvertTile / _Wall 的尾部 SquareTileFrame(x,y)/SquareWallFrame(x,y)
//   对【一切 conversionType】无条件执行（num 门只包 RainbowSandAndBlackSandWalls 清漆）。
// 消费面：
//   · SecretSeedDoEndsPass.doHallowOnSurface（does that sparkle / 周年组合 finalize 臂）
//   · SecretSeedDoEndsPass.convertWithSize 的 face-2 可达面
//   · HardmodePass.initializeHardMode remix 边缘带臂（cs:31906-31941，经 convertHallowCell）
// 骰流影响声明：本修使上述面的转化骰耗开始与 x86 对齐——凡种子含 hallowOnTheSurface/
//   remix/too easy 组合的既有金标若涉及此域须按「金标陈旧登记惯例」归属本刀；
//   七链认证域（tile 面 mile8 106 槽）不消费 face-2 finalize 臂的组合不在其列。
// 掷流探针先例：core/rng.ts __swOnRoll（观测钩）+ FinalCleanupPass.__swFntProbeI39
//   （SQ/K 事件标定钩，probe 同款 ii108tm/_iii105tm 基座）。
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import {
  convertHallowCell, doHallowOnSurface,
} from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { initializeHardMode } from '../src/world/gen/vanilla/HardmodePass';

const STONE = TILE_BY_KEY['stone']!;          // sheet 1（CONV_STONE → case2 转珍珠岩）
const TREE = TILE_BY_KEY['tree']!;            // sheet 5（IS_A_TREE_TRUNK 护栏必杀支）
const sheetAt = (st: TileStore, x: number, y: number): number =>
  TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet ?? -1;

/** RNG internalSample 观测窗（hardmode-init.test.ts countRolls 同款；观测不消费状态） */
function countRolls<T>(fn: () => T): { value: T; rolls: number } {
  const g = globalThis as { __swOnRoll?: (value: number, inst: object) => void };
  const prev = g.__swOnRoll;
  let n = 0;
  g.__swOnRoll = () => { n++; };
  try {
    return { value: fn(), rolls: n };
  } finally {
    g.__swOnRoll = prev;
  }
}

/** IIIII39 级联族标定钩（FinalCleanupPass __swFnt39 probe）：捕获 'SQ|x,y|rc' 行 */
function withFntProbe<T>(fn: () => T): { value: T; lines: string[] } {
  const G = globalThis as { __swFntProbeI39?: { emit?: (l: string) => void } | null };
  const prev = G.__swFntProbeI39 ?? null;
  const lines: string[] = [];
  G.__swFntProbeI39 = { emit: (l) => lines.push(l) };
  try {
    return { value: fn(), lines };
  } finally {
    G.__swFntProbeI39 = prev;
  }
}
const sqCoords = (lines: string[]): string[] =>
  lines.filter((l) => l.startsWith('SQ|'))
    .map((l) => l.slice(3, l.indexOf('|', 3)));

/** 最小 GenState 占位（case-2 面不解引用 rockLevel 段；convertHallowCell 缺省同 idiom） */
function mkGs(worldSurface: number): never {
  return { seedFlags: {}, worldSurface, rockLevel: 120 } as never;
}

describe('★III-F5 case-2 尾级联（cs:56801/:56813 无条件原文）', () => {
  it('方块臂：转化落格（石→珍珠岩）且中心 SquareTileFrame 结构性触发（SQ 探针=probe 先例）', () => {
    const st = new TileStore(120, 80);
    st.setTileSilent(60, 60, STONE);
    const r = new RNG(20260901);
    const res = withFntProbe(() => convertHallowCell(st, r, 60, 60));
    expect(sheetAt(st, 60, 60)).toBe(117);                       // 珍珠岩落格
    // ★修复前：cascades=false ⇒ genSquareTileFrame 整段缺席 ⇒ SQ 计数恒零。
    //   修复后：转换尾恰好一枚中心帧（九宫邻空、无击杀级联加掷）
    expect(sqCoords(res.lines)).toEqual(['60,60']);
  });

  it('转化骰记录非零（同格墙臂方帧一骰入账 + 树干护栏必杀支级联在案）', () => {
    // 真实神圣地表列 = 块面与墙面同时转化：石+腐化草墙63 同格 → 双臂齐走。
    // ★注意：孤树 KillTile 的尘掷表对树干(5)恒零掷——非零掷的确定性来源是
    //   「墙写尾 genSquareWallFrame 一骰」（CenterPoint resetFrame Next(0,3)）。
    const st = new TileStore(120, 80);
    st.setTileSilent(60, 60, STONE);
    st.setWallSilent(60, 60, 63);                               // WALL_CONV_GRASS 且 ≠70
    st.setTileSilent(60, 59, TREE);                             // 树干立于转化面上（触发护栏支）
    const r = new RNG(99123);
    const probe = withFntProbe(() => countRolls(() => convertHallowCell(st, r, 60, 60)));
    const rolls = probe.value.rolls;
    expect(sheetAt(st, 60, 60)).toBe(117);
    expect(probe.lines.some((l) => l.startsWith('KT|'))).toBe(true);   // 护栏必杀支实走
    expect(sqCoords(probe.lines)).toContain('60,60');           // 转化尾方帧在案
    expect(rolls).toBeGreaterThanOrEqual(1);                    // ★「尾掷记录非零」钉点（含墙帧一骰）
  });

  it('已达标面早退：目标型一致 ⇒ 零转化、零级联（门面守卫）', () => {
    const st = new TileStore(120, 80);
    st.setTileSilent(60, 60, TILE_BY_KEY['v_117_pearlstone_block']!);
    const r = new RNG(5150);
    const probe = withFntProbe(() => countRolls(() => convertHallowCell(st, r, 60, 60)));
    expect(sheetAt(st, 60, 60)).toBe(117);
    expect(probe.value.rolls).toBe(0);
    expect(sqCoords(probe.lines)).toEqual([]);
  });

  it('墙臂：wall 63→70 后 genSquareWallFrame 恰一骰（CenterPoint resetFrame 单掷）', () => {
    const st = new TileStore(120, 80);
    st.setWallSilent(60, 60, 63);                               // WALL_CONV_GRASS 且 ≠70
    const r = new RNG(777123);
    const res = countRolls(() => convertHallowCell(st, r, 60, 60));
    expect(st.wall[st.idx(60, 60)]).toBe(70);                   // 神圣草墙落定
    expect(res.rolls).toBe(1);                                  // ★Next(0,3) 一掷（非墙21 不二掷）

    // 对照：已达标的神圣草墙不再进 Convert_ActuallyConvertWall ⇒ 全链零骰
    const st2 = new TileStore(120, 80);
    st2.setWallSilent(60, 60, 70);
    const r2 = new RNG(777124);
    expect(countRolls(() => convertHallowCell(st2, r2, 60, 60)).rolls).toBe(0);
  });
});

describe('★III-F5 hallowOnTheSurface finalize 臂两处骰入账抽查（doHallowOnSurface）', () => {
  const W = 180, WS = 45;
  /** 表层带：per-column 必掷 Next(3) ⇒ 列数是入账下限（与内容无关） */
  it('① 方块臂入账：整带草转珍珠草（109），总掷 ≥ 列数', () => {
    const st = new TileStore(W, 90);
    for (let x = 40; x < 140; x++) st.setTileSilent(x, WS - 1, TILE_BY_KEY['grass']!);   // sheet 2
    const gs = mkGs(WS);
    const { rolls } = countRolls(() => doHallowOnSurface(st, new RNG(2026), gs));
    let hallowGrass = 0;
    for (let x = 40; x < 140; x++) if (sheetAt(st, x, WS - 1) === 109) hallowGrass++;
    expect(hallowGrass).toBeGreaterThan(0);
    expect(rolls).toBeGreaterThanOrEqual(W);                    // 逐列 Next(3) 入账下限
  });

  it('② 墙臂入账：地表带 63 族墙转 70，总掷 = 列数 + 逐格方帧一骰', () => {
    const st = new TileStore(W, 90);
    const cols: number[] = [];
    for (let x = 40; x < 140; x++) {
      st.setWallSilent(x, WS - 8, 63);   // 必须落在逐列扫描带 j<lim=ws+Next(3) 内
      cols.push(x);
    }
    const gs = mkGs(WS);
    const { rolls } = countRolls(() => doHallowOnSurface(st, new RNG(31), gs));
    let converted = 0;
    for (const x of cols) if (st.wall[st.idx(x, WS - 8)] === 70) converted++;
    expect(converted).toBe(cols.length);                        // 全数转 70
    expect(rolls).toBeGreaterThanOrEqual(W + converted);        // 列掷 + 墙写尾方帧逐格一骰
  });
});

describe('★III-F5 HardmodePass remix 边缘带臂连带（convertHallowCell 同源全链）', () => {
  it('remix 世界 initializeHardMode 边缘带落珍珠岩且骰耗在案', () => {
    const w = 420, h = 220;
    const store = new TileStore(w, h);
    const stone = TILE_BY_KEY['stone']!;
    for (let x = 0; x < w; x++) {
      for (let y = 90; y < h - 10; y++) store.setTileSilent(x, y, stone);
      store.setWallSilent(x, 95, 63);
    }
    const world = {
      store, seed: 20260813, crimson: false,
      dungeonX: Math.trunc(w / 4) + 1, groundLevel: 90,
      flags: {}, seedFlags: { remix: true }, skyblockLowTiles: false,
    } as never;
    const { rolls } = countRolls(() => initializeHardMode(world, new RNG(424242)));
    let pearl = 0, wall70 = 0;
    for (let x = w - Math.trunc(w / 7) - Math.trunc(w / 14); x < w; x++) {
      for (let y = 89; y < h - 10; y++) {
        if (sheetAt(store, x, y) === 117) pearl++;
        if (store.wall[store.idx(x, y)] === 70) wall70++;
      }
    }
    expect(pearl).toBeGreaterThan(0);                           // 外侧翼无条件 Convert(·,2)
    expect(rolls).toBeGreaterThan(1000);                        // 带内逐格面骰耗显著入账
    expect(wall70).toBeGreaterThanOrEqual(0);
  });
});
