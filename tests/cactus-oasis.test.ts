// 仙人掌/珊瑚/绿洲回归（对照 1456 CactusPalmTreesAndCoral cs:21115-21325 +
// GrowCactus cs:56584 + PlantCactus cs:54176 + Oasis cs:16327 + PlaceOasis cs:10716）
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { T, TILE_BY_KEY } from '../src/data/tiles';
import { newGenState } from '../src/world/gen/vanilla/GenState';
import {
  runCactusPalmTreesAndCoralPass,
  plantCactus,
} from '../src/world/gen/vanilla/StructuresPass';
import { placeOasis, runOasisPass } from '../src/world/gen/vanilla/OasisPass';

const CACT = TILE_BY_KEY['v_80_cactus']!;
const CORAL = TILE_BY_KEY['v_81_coral']!;
const SHELL = TILE_BY_KEY['v_324_seashells']!;
const SAND = T.SAND;

/** 沙漠平原：surface 行起往下全沙（wall 0、无液） */
function desert(w: number, h: number, surface: number): TileStore {
  const st = new TileStore(w, h);
  for (let x = 0; x < w; x++) {
    for (let y = surface; y < h; y++) st.setTileSilent(x, y, SAND);
  }
  return st;
}

function countType(st: TileStore, type: number): number {
  let n = 0;
  for (let k = 0; k < st.type.length; k++) if (st.type[k] === type && st.flags[k]) n++;
  return n;
}

describe('仙人掌 pass（CactusPalmTreesAndCoral）', () => {
  it('中段 PlantCactus 成簇：多列多株 + 高度门 ≤12 + 落点必在沙面之上', () => {
    const st = desert(1200, 300, 150);
    const gs = newGenState(st.w, st.h);
    gs.worldSurface = 160;
    runCactusPalmTreesAndCoralPass(st, new RNG(1337), gs);
    const cacti = countType(st, CACT);
    // 列距骰 Next(11,13) + 400 列中段 → 成簇语义（150 次邻域尝试）必有可观数量
    expect(cacti).toBeGreaterThanOrEqual(10);
    // 高度门：单列计数(含锚) ≥ Next(11,13) 即停 → 列高 ≤ 12
    let maxCol = 0, columns = 0;
    for (let x = 0; x < st.w; x++) {
      let col = 0;
      for (let y = 0; y < st.h; y++) {
        if (st.type[st.idx(x, y)] === CACT && st.flags[st.idx(x, y)]) col++;
      }
      if (col > 0) { columns++; maxCol = Math.max(maxCol, col); }
    }
    expect(columns).toBeGreaterThanOrEqual(5);
    expect(maxCol).toBeLessThanOrEqual(12);
    // 落点：每株仙人掌要么扎根沙面（下方沙族），要么是横向分叉臂
    // （同行邻接主干——原版臂格可悬空，cs:56731-56758）
    for (let x = 0; x < st.w; x++) {
      for (let y = 0; y < st.h; y++) {
        const k = st.idx(x, y);
        if (st.type[k] !== CACT || !st.flags[k]) continue;
        const isC = (ax: number, ay: number) =>
          st.inBounds(ax, ay) && st.flags[st.idx(ax, ay)] === 1 && st.type[st.idx(ax, ay)] === CACT;
        if (isC(x, y + 1)) continue;
        const rooted = st.inBounds(x, y + 1) && st.type[st.idx(x, y + 1)] === SAND;
        const arm = isC(x - 1, y) || isC(x + 1, y);
        expect(rooted || arm).toBe(true);
      }
    }
  });

  it('PlantCactus 单点：锚点成簇（150 次邻域尝试后 >1 株）', () => {
    const st = desert(120, 200, 100);
    plantCactus(st, new RNG(7), 60, 100);
    expect(countType(st, CACT)).toBeGreaterThan(1);
    expect(st.flags[st.idx(60, 99)]).toBe(1);   // 锚点直上必有一株
  });

  it('两端海滩段珊瑚落点：湿沙面 1/2 珊瑚 81(frameX=26*k) / 干沙面贝壳 324', () => {
    const st = desert(1200, 300, 150);
    // 左海滩 [5,380)：湿沙面（上方 4 格满水）+ 干沙面带
    for (let x = 5; x < 380; x++) {
      const wet = !(x >= 100 && x < 150);
      if (wet) for (let y = 145; y < 150; y++) { st.liquid[st.idx(x, y)] = 255; st.liquidType[st.idx(x, y)] = 1; }
    }
    const gs = newGenState(st.w, st.h);
    gs.worldSurface = 160;
    runCactusPalmTreesAndCoralPass(st, new RNG(2024), gs);
    // 珊瑚：frameX ∈ 26*Next(6)，且下方须活性实心（PlaceTile 81 门）
    let corals = 0, shells = 0;
    for (let x = 5; x < 380; x++) {
      for (let y = 0; y < 160; y++) {
        const k = st.idx(x, y);
        if (!st.flags[k]) continue;
        const below = st.idx(x, y + 1);
        if (st.type[k] === CORAL) {
          corals++;
          expect([0, 26, 52, 78, 104, 130]).toContain(st.frameX[k]);
          expect(st.flags[below]).toBe(1);   // PlaceTile 81：下方活性实心
        } else if (st.type[k] === SHELL) {
          shells++;
          expect([0, 22, 44]).toContain(st.frameX[k]);            // Place1x1：22*Next(3)
          expect([0, 22, 44, 66, 88]).toContain(st.frameY[k]);  // 22*style(0-4)
          expect(st.flags[below]).toBe(1);
        }
      }
    }
    expect(corals).toBeGreaterThan(0);
    expect(shells).toBeGreaterThan(0);
  });
});

describe('绿洲 pass（Oasis / PlaceOasis）', () => {
  it('PlaceOasis：沙漠平原挖塘（水 127/255）+ 登记 oasisPosition', () => {
    const st = desert(1200, 400, 150);
    const gs = newGenState(st.w, st.h);
    gs.worldSurface = 200;
    expect(placeOasis(st, new RNG(11), gs, 600, 50)).toBe(true);
    expect(gs.numOasis).toBe(1);
    expect(gs.oasisX[0]).toBe(600);
    expect(gs.oasisW[0]).toBeGreaterThanOrEqual(45);
    expect(gs.oasisW[0]).toBeLessThanOrEqual(60);
    // 水塘：至少一格水（127 半格 / 255 满水），liquidType = 水
    let water = 0;
    for (let k = 0; k < st.liquid.length; k++) {
      if (st.liquid[k] > 0) {
        expect(st.liquidType[k]).toBe(1);
        expect([127, 255]).toContain(st.liquid[k]);
        water++;
      }
    }
    expect(water).toBeGreaterThan(10);
  });

  it('PlaceOasis 距离门：已登记绿洲 350 内即拒', () => {
    const st = desert(1200, 400, 150);
    const gs = newGenState(st.w, st.h);
    gs.worldSurface = 200;
    expect(placeOasis(st, new RNG(11), gs, 600, 50)).toBe(true);
    expect(placeOasis(st, new RNG(12), gs, 650, 50)).toBe(false);   // dx=50 < 350
  });

  it('runOasisPass：全沙漠至少 1 处绿洲（数量 = w/2100 + Next(2)）', () => {
    const st = desert(2400, 400, 150);
    const gs = newGenState(st.w, st.h);
    gs.worldSurface = 200;
    runOasisPass(st, new RNG(99), gs);
    expect(gs.numOasis).toBeGreaterThanOrEqual(1);
    let water = 0;
    for (let k = 0; k < st.liquid.length; k++) if (st.liquid[k] > 0) water++;
    expect(water).toBeGreaterThan(0);
  });
});
