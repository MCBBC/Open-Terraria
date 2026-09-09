// ★IIIII226 一次性诊断/验证测试（node 侧 vitest 直调，不走 run-diag）：
//   npx vitest run tests/_iii226-flags.test.ts
//   世界生成重探针须 SW_III226=1（4200×1200 全链 ~30-90s/籽，避免并行全量误跑）。
// 覆盖三实装臂 + 季节/出生/血月 boot 复核：
//   A. errorWorld 游戏期树高臂贯通（GrowTreeWithSettings 系 ash/gem/vanity 路径）
//   B. halloweenGen 日期臂（applyHalloweenSeasonSeed / isHalloweenDateNow）
//   C. noSurface 随机落点臂（spawnPointPass cs:19641-19668 + spawnIsAreaValidSpawn
//      generatingSpawn 双地牢门）
//   D. graveyardBloodmoonStart 开局夜相+血月 boot（applyGraveyardInitialClockState）
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { spawnIsAreaValidSpawn } from '../src/world/spawn/SpawnPlacement';
import { applyHalloweenSeasonSeed, isHalloweenDateNow } from '../src/ui/WorldCreation';
import { parseSeedChain } from '../src/world/gen/SeedEasterEggs';
import { growAshTree } from '../src/world/gen/vanilla/TreePass';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { RNG } from '../src/core/rng';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';

const HEAVY = process.env.SW_III226 === '1';

// ── B. halloweenGen 日期臂（纯函数，Main.isHalloweenDateNow Main.cs:13313-13327 镜像）──

describe('IIIII226 B: isHalloweenDateNow（10/10-10/31 ∪ 11/1）', () => {
  it('10/9=false, 10/10=true, 10/15=true, 10/31=true', () => {
    expect(isHalloweenDateNow(new Date(2026, 9, 9))).toBe(false);
    expect(isHalloweenDateNow(new Date(2026, 9, 10))).toBe(true);
    expect(isHalloweenDateNow(new Date(2026, 9, 15))).toBe(true);
    expect(isHalloweenDateNow(new Date(2026, 9, 31))).toBe(true);
  });
  it('11/1=true, 11/2=false, 10/1-10/9=false, 12/1=false', () => {
    expect(isHalloweenDateNow(new Date(2026, 10, 1))).toBe(true);
    expect(isHalloweenDateNow(new Date(2026, 10, 2))).toBe(false);
    expect(isHalloweenDateNow(new Date(2026, 9, 1))).toBe(false);
    expect(isHalloweenDateNow(new Date(2026, 11, 1))).toBe(false);
  });
});

describe('IIIII226 B: applyHalloweenSeasonSeed（WorldFileData.cs:417-425 镜像）', () => {
  const HW = new Date(2026, 9, 15);   // 万圣窗内
  const OFF = new Date(2026, 11, 25); // 窗外
  it('空种子 × 窗内 → 前缀 pumpkinseason|', () => {
    const out = applyHalloweenSeasonSeed('', HW);
    expect(out.startsWith('pumpkinseason|')).toBe(true);
    expect(parseSeedChain(out).flags.halloweenGen).toBe(true);
  });
  it('特殊种子文本 × 窗内 → 保留原文+前缀（旗标并集解析）', () => {
    const out = applyHalloweenSeasonSeed('05162020', HW);
    expect(out).toBe('pumpkinseason|05162020');
    const f = parseSeedChain(out).flags;
    expect(f.halloweenGen).toBe(true);
    expect(f.drunkWorld).toBe(true);
  });
  it('普通种子 × 窗内 → 原样（vanilla FinishCreatingWorld 只对空/特殊种子走日期臂）', () => {
    expect(applyHalloweenSeasonSeed('12345', HW)).toBe('12345');
  });
  it('窗外 → 恒原样（零触碰）', () => {
    expect(applyHalloweenSeasonSeed('', OFF)).toBe('');
    expect(applyHalloweenSeasonSeed('05162020', OFF)).toBe('05162020');
    expect(applyHalloweenSeasonSeed('12345', OFF)).toBe('12345');
  });
});

// ── C1. spawnIsAreaValidSpawn generatingSpawn 双地牢门（Player.cs:38253-38257）──

describe('IIIII226 C1: Spawn_IsAreaValidSpawn generatingSpawn 门', () => {
  const X = 100, Y = 100;
  it('默认参：地牢墙不构成堵塞（墙腿只在生成期双地牢门内生效）', () => {
    const st = new TileStore(200, 200);
    st.setWall(X, Y - 1, 7);                                    // 地牢墙（Main.wallDungeon）
    expect(spawnIsAreaValidSpawn(st, X, Y)).toBe(true);
  });
  it('generatingSpawn∧dualDungeonsSeed：地牢墙 → 拒（:38253-38257）', () => {
    const st = new TileStore(200, 200);
    st.setWall(X, Y - 1, 7);
    expect(spawnIsAreaValidSpawn(st, X, Y, { generatingSpawn: true, dualDungeonsSeed: true })).toBe(false);
  });
  it('generatingSpawn 缺 dualDungeonsSeed：地牢墙仍通过（门=generatingSpawn && Main.dualDungeonsSeed）', () => {
    const st = new TileStore(200, 200);
    st.setWall(X, Y - 1, 7);
    expect(spawnIsAreaValidSpawn(st, X, Y, { generatingSpawn: true })).toBe(true);
  });
  it('generatingSpawn∧dualDungeonsSeed：tile 腿=已致动地牢砖仍拒（门读 active() 非 nactive）', () => {
    const st = new TileStore(200, 200);
    const brick = TILE_INTERNAL_BY_SHEET.get(41)!;              // 蓝地牢砖（Main.tileDungeon）
    st.setTile(X, Y - 1, brick);
    st.wire[st.idx(X, Y - 1)] = TileStore.WIRE_ACTUATED;        // 已致动 → nactive=false（实体腿放过）
    // vanilla 门腿 = tile.active() && IsConsideredDungeonTile → 已致动格 active() 仍真 → 拒
    expect(spawnIsAreaValidSpawn(st, X, Y, { generatingSpawn: true, dualDungeonsSeed: true })).toBe(false);
  });
  it('幽灵残型（active=false）地牢砖不触发 tile 腿（vanilla tile.active() 前置同构）', () => {
    const st = new TileStore(200, 200);
    const brick = TILE_INTERNAL_BY_SHEET.get(41)!;
    const bi = st.idx(X, Y - 1);
    st.type[bi] = brick;
    st.flags[bi] = 0;                                           // active=false（无墙腿辅助）
    expect(spawnIsAreaValidSpawn(st, X, Y, { generatingSpawn: true, dualDungeonsSeed: true })).toBe(true);
  });
});

// ── A. errorWorld 游戏期树高臂（GrowTreeWithSettings cs:30709-30712）──────────

function ashTreeSetup(): { st: TileStore; x: number; gy: number } {
  const st = new TileStore(64, 220);
  const ashGrass = TILE_INTERNAL_BY_SHEET.get(633)!;
  const sapling = TILE_INTERNAL_BY_SHEET.get(20)!;              // Tree_Ash.SaplingTileType=20
  const x = 32, gy = 150;
  for (let dx = -3; dx <= 3; dx++) st.setTile(x + dx, gy, ashGrass);
  const si = st.idx(x, gy - 1);
  st.type[si] = sapling; st.flags[si] = 1;
  st.frameX[si] = 10 * 54;                                      // style 10（灰烬档）
  return { st, x, gy };
}

describe('IIIII226 A: errorWorld 游戏期 ash 树高臂（growAshTree gs 贯通）', () => {
  it('无旗：高度全部落在 Tree_Ash 7-12 档（零额外掷）', () => {
    const { st, x, gy } = ashTreeSetup();
    const gs = { genTrees: [], seedFlags: {}, worldSurface: 120 } as unknown as GenState;
    const treeTile = TILE_INTERNAL_BY_SHEET.get(634)!;
    const heights: number[] = [];
    for (let k = 0; k < 24; k++) {
      st.flags.fill(0); st.type.fill(0);
      for (let dx = -3; dx <= 3; dx++) st.setTile(x + dx, gy, TILE_INTERNAL_BY_SHEET.get(633)!);
      const si = st.idx(x, gy - 1);
      st.type[si] = TILE_INTERNAL_BY_SHEET.get(20)!; st.flags[si] = 1; st.frameX[si] = 540;
      expect(growAshTree(st, new RNG(0x9e3779b9 ^ k), x, gy - 1, 0, true, gs)).toBe(true);
      let top = gy;
      while (top > 0 && st.type[st.idx(x, top - 1)] === treeTile) top--;
      heights.push(gy - top);
    }
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(7);
    expect(Math.max(...heights)).toBeLessThanOrEqual(12);
  });
  it('errorWorld 旗：checkedY<worldSurface → Next(3,49) 重掷档，40 样本必出 >12 高树', () => {
    const { st, x, gy } = ashTreeSetup();
    const gs = { genTrees: [], seedFlags: { errorWorld: true }, worldSurface: 200 } as unknown as GenState;
    const treeTile = TILE_INTERNAL_BY_SHEET.get(634)!;
    const heights: number[] = [];
    for (let k = 0; k < 40; k++) {
      st.flags.fill(0); st.type.fill(0);
      for (let dx = -3; dx <= 3; dx++) st.setTile(x + dx, gy, TILE_INTERNAL_BY_SHEET.get(633)!);
      const si = st.idx(x, gy - 1);
      st.type[si] = TILE_INTERNAL_BY_SHEET.get(20)!; st.flags[si] = 1; st.frameX[si] = 540;
      if (!growAshTree(st, new RNG(0x9e3779b9 ^ k), x, gy - 1, 0, true, gs)) { heights.push(-1); continue; }
      let top = gy;
      while (top > 0 && st.type[st.idx(x, top - 1)] === treeTile) top--;
      heights.push(gy - top);
    }
    const ok = heights.filter((h) => h >= 7);
    expect(ok.length).toBeGreaterThan(20);                      // 主流成树
    expect(Math.max(...ok)).toBeGreaterThan(12);                // 重掷档显形（vanilla Next(3,50)）
    expect(Math.min(...ok)).toBeGreaterThanOrEqual(3);          // 重掷下限 3
  });
});

// ── C2/D. 世界生成重探针（SW_III226=1 门控）────────────────────────────────

describe.skipIf(!HEAVY)('IIIII226 C2: noSurface 随机落点臂（molepeople 全链生成）', () => {
  it('molepeople：出生点=中心 ±300/±200 盒内四行空腔（cs:19641-19668）', async () => {
    const { generateWorld } = await import('../src/world/gen/WorldGen');
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'molepeople', evil: 0 });
    expect(world.seedFlags?.noSurface).toBe(true);
    const cx = Math.floor(world.store.w / 2), cy = Math.floor(world.store.h / 2);
    expect(Math.abs(world.spawnX - cx)).toBeLessThanOrEqual(300);   // cs:19643 num5=300
    expect(Math.abs(world.spawnY - cy)).toBeLessThanOrEqual(200);   // cs:19644 num6=200
    // 落点四行空腔：floorY 行本体 inactive + 上方 3 行净空 + 无液（Spawn_IsAreaValidSpawn 语义）
    expect(world.store.hasTile(world.spawnX, world.spawnY)).toBe(false);
    for (let dy = 1; dy <= 3; dy++) {
      expect(world.store.hasTile(world.spawnX, world.spawnY - dy)).toBe(false);
      expect(world.store.liquid[world.store.idx(world.spawnX, world.spawnY - dy)]).toBe(0);
    }
  }, 420000);
});

describe.skipIf(!HEAVY)('IIIII226 D: graveyardBloodmoonStart 开局夜相+血月 boot', () => {
  it('nightofthelivingdead：gen 终 clock=夜相 19:30 一格 + bloodMoon=true（ResetTempsToDayTime :1019）', async () => {
    const { generateWorld } = await import('../src/world/gen/WorldGen');
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'nightofthelivingdead', evil: 0 });
    expect(world.seedFlags?.graveyardBloodmoonStart).toBe(true);
    expect(world.clock.bloodMoon).toBe(true);                       // _tempBloodMoon = true
    expect(world.clock.dayCount).toBe(1);                           // 夜段计数（dayTime=false）
    expect(world.clock.timeOfDay).toBeCloseTo(19.5 / 24 + (1 / 32400) * 0.375, 6);
  }, 420000);
});
