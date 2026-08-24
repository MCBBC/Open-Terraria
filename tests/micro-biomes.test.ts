// MicroBiomes pass 新增四子项回归(DeadMansChest / ThinIce / TrackGenerator / placeLavaTrap):
// 直接构造合成世界调 place* 单元,验证门禁链与落块结果(掷骰序由源码 1:1 保证)。
import { describe, it, expect } from 'vitest';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { newGenState } from '../src/world/gen/vanilla/GenState';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  DeadMansChestBiome,
  placeThinIcePatch,
  placeLavaTrap,
} from '../src/world/gen/vanilla/MicroBiomesPass';
import { TrackGenerator } from '../src/world/gen/vanilla/TrackPass';
import { TRACK_TILE, TRACK_FRAMES } from '../src/world/MinecartTrack';

const THIN_ICE = TILE_BY_KEY['thin_ice']!;
const CHEST = TILE_BY_KEY['chest']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
const DART_TRAP = TILE_BY_KEY['v_137_traps']!;
const EXPLOSIVES = TILE_BY_KEY['v_141_explosives']!;
const PLATE = TILE_BY_KEY['v_135_pressure_plates']!;
const BOULDER = TILE_BY_KEY['v_138_boulder']!;
const DIRT = TILE_BY_KEY['dirt']!;
const SNOW = TILE_BY_KEY['snow']!;
const STONE = TILE_BY_KEY['stone']!;

/** 整图填 dirt 再掏洞的合成世界 */
function dirtWorld(w: number, h: number): TileStore {
  const st = new TileStore(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) st.setTileSilent(x, y, DIRT);
  }
  return st;
}

describe('ThinIceBiome(cs:21825-21854 + ThinIceBiome.cs)', () => {
  it('雪原水面:扫描门禁通过后落 162 斑,水面格液体被清', () => {
    const st = new TileStore(120, 90);
    // 雪原地面 y≥42,其上 y 38..41 为满格水
    for (let x = 20; x < 100; x++) {
      for (let y = 38; y < 41; y++) {
        st.liquid[st.idx(x, y)] = 255;
        st.liquidType[st.idx(x, y)] = LIQUID_TYPE.WATER;
      }
      for (let y = 41; y < 70; y++) st.setTileSilent(x, y, SNOW);
    }
    const rng = new RNG(20260812);
    const gs = newGenState(st.w, st.h);
    const ok = placeThinIcePatch(st, rng, gs, 60, 39);
    expect(ok).toBe(true);
    let ice = 0, icedWater = 0;
    for (let i = 0; i < st.w * st.h; i++) {
      if (st.type[i] === THIN_ICE) {
        ice++;
        if (st.liquid[i] === 0 && st.liquidType[i] === LIQUID_TYPE.NONE) icedWater++;
      }
    }
    expect(ice).toBeGreaterThan(20);
    expect(icedWater).toBeGreaterThan(0);   // 第二链 HasLiquid→SetTile→SetLiquid(0,0)
  });

  it('泥/石占优的门禁拒绝(cs:19-22:雪须同时 > 泥 与 > 泥+石)', () => {
    const st = dirtWorld(120, 90);
    for (let x = 30; x < 60; x++) for (let y = 30; y < 60; y++) st.setTileSilent(x, y, SNOW);
    const before = st.type.slice();
    const ok = placeThinIcePatch(st, new RNG(7), newGenState(st.w, st.h), 60, 40);
    expect(ok).toBe(false);
    expect(st.type).toEqual(before);   // 拒绝时零写入、零掷骰消费差异不敏感
  });
});

describe('placeLavaTrap(WorldGen.cs:8648-8732)', () => {
  it('岩浆湖底陷阱:压板 135 style7 + 红线 + 湖底致动石栅', () => {
    // h=600 使 h-200=400 的地狱下界检查放行(浅世界湖体会被 cs:8670/8695 拒)
    const st = new TileStore(120, 600);
    const gs = newGenState(120, 600);
    // 岩浆湖 y 300..319(满格),湖底石层 320..323,空腔 324..333,腔底 334+
    for (let y = 300; y < 320; y++) {
      for (let x = 30; x < 90; x++) {
        st.liquid[st.idx(x, y)] = 255;
        st.liquidType[st.idx(x, y)] = LIQUID_TYPE.LAVA;
      }
    }
    for (let y = 320; y < 324; y++) for (let x = 30; x < 90; x++) st.setTileSilent(x, y, STONE);
    for (let y = 334; y < 400; y++) for (let x = 30; x < 90; x++) st.setTileSilent(x, y, STONE);
    expect(placeLavaTrap(st, gs, 60, 310)).toBe(true);
    // 压板落腔底上一格(60,333),style 7 在 frameY=126
    const plate = st.idx(60, 333);
    expect(st.type[plate]).toBe(PLATE);
    expect(st.frameY[plate]).toBe(126);
    // 红线 num8..num10 = 320..333;致动位仅湖底层 320..323
    for (let y = 320; y <= 333; y++) {
      expect(st.wire[st.idx(60, y)] & TileStore.WIRE_RED).toBeTruthy();
    }
    for (let y = 320; y <= 323; y++) {
      expect(st.wire[st.idx(60, y)] & TileStore.WIRE_ACTUATOR).toBeTruthy();
    }
    expect(st.wire[plate] & TileStore.WIRE_ACTUATOR).toBeFalsy();
  });

  it('锚点非满格岩浆 → 拒绝', () => {
    const st = new TileStore(120, 600);
    const gs = newGenState(120, 600);
    st.liquid[st.idx(60, 310)] = 200;   // 非满格
    st.liquidType[st.idx(60, 310)] = LIQUID_TYPE.LAVA;
    expect(placeLavaTrap(st, gs, 60, 310)).toBe(false);
  });
});

describe('DeadMansChestBiome(DeadMansChestBiome.cs)', () => {
  function caveWorld(): TileStore {
    const st = dirtWorld(140, 120);
    // 腔体含 y=53 行:1457 FindBoulderTrapSpot_CheckSpot 新增门(cs:265-269,1456 无)——
    // 巨石锚位正下两格 (x,y+1)/(x+1,y+1) 均实心即弃位;全实心地板下扫描列(锚 y=52,
    // 下探 53)全被此门拒 → boulders=0 → AreThereEnoughTraps 恒 false。上扩一行给门留空气。
    for (let x = 44; x <= 57; x++) for (let y = 53; y <= 58; y++) st.setTileSilent(x, y, 0);
    // 金箱锚点 (50,57):2×2 style 1 帧
    st.setTileSilent(50, 57, CHEST, 36, 0);
    st.setTileSilent(51, 57, CHEST, 54, 0);
    st.setTileSilent(50, 58, CHEST, 36, 18);
    st.setTileSilent(51, 58, CHEST, 54, 18);
    return st;
  }

  it('金箱转死亡之箱 + 飞镖/炸药/红线落块', () => {
    const st = caveWorld();
    const gs = newGenState(140, 120);
    gs.beachDistance = 10;   // 测试世界窄,缩海滩回避带
    const rng = new RNG(424242);
    const biome = new DeadMansChestBiome(st, rng, gs, [{ x: 50, y: 57 }]);   // 候选序 = chest sink(2026-08-17 起非栅格扫描)
    expect(biome.getPossibleChests()).toEqual([{ x: 50, y: 57 }]);
    expect(biome.place(50, 57)).toBe(true);
    // TurnGoldChestIntoDeadMansChest(cs:479-492):467 + 帧 144+i*18 / j*18
    expect(st.type[st.idx(50, 57)]).toBe(CHEST2);
    expect(st.frameX[st.idx(50, 57)]).toBe(144);
    expect(st.frameX[st.idx(51, 57)]).toBe(162);
    expect(st.frameY[st.idx(50, 58)]).toBe(18);
    // 陷阱族至少各一:飞镖 137 / 巨石 138 / 炸药 141
    const seen = new Set<number>();
    for (let i = 0; i < st.w * st.h; i++) seen.add(st.type[i]);
    expect(seen.has(DART_TRAP)).toBe(true);
    expect(seen.has(EXPLOSIVES)).toBe(true);
    // 红线网存在(箱体周边)
    let wired = 0;
    for (let x = 40; x < 70; x++) for (let y = 45; y < 70; y++) {
      if (st.wire[st.idx(x, y)] & TileStore.WIRE_RED) wired++;
    }
    expect(wired).toBeGreaterThan(3);
  });

  it('IsAGoodSpot:无 40 格连通空腔的金箱不入候选(cs:472-475)', () => {
    const st = dirtWorld(140, 120);
    st.setTileSilent(50, 57, CHEST, 36, 0);
    st.setTileSilent(51, 57, CHEST, 54, 0);
    st.setTileSilent(50, 58, CHEST, 36, 18);
    st.setTileSilent(51, 58, CHEST, 54, 18);
    const gs = newGenState(140, 120);
    gs.beachDistance = 10;
    const biome = new DeadMansChestBiome(st, new RNG(1), gs, []);
    expect(biome.getPossibleChests()).toEqual([]);   // 箱体嵌死在土里,countTiles<40
  });
});

describe('TrackGenerator(TrackGenerator.cs)', () => {
  it('平地起轨:≥minLength 连贯轨道链 + 合法连接帧', () => {
    // h=600:UnderworldLayer=400 / worldSurface=180——轨体须落在 (180, 400) 带
    const st = new TileStore(200, 600);
    const gs = newGenState(200, 600);
    gs.beachDistance = 10;
    for (let y = 250; y < 600; y++) for (let x = 0; x < 200; x++) st.setTileSilent(x, y, DIRT);
    const gen = new TrackGenerator(st, gs);
    expect(gen.place(50, 200, 20, 60, new RNG(99))).toBe(true);
    // 收集轨道格
    const cells: Array<[number, number]> = [];
    let badFrame = 0;
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.type[i] === TRACK_TILE && st.flags[i]) {
          cells.push([x, y]);
          if (st.frameX[i] >= TRACK_FRAMES) badFrame++;
        }
      }
    }
    expect(cells.length).toBeGreaterThanOrEqual(20);
    expect(badFrame).toBe(0);   // frameX = 前轨连接 ID(0-35)
    // 连通性:BFS 单分量(8 邻接)
    const set = new Set(cells.map(([x, y]) => y * st.w + x));
    const stack = [cells[0]];
    const seen = new Set<number>([cells[0][1] * st.w + cells[0][0]]);
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const k = (y + dy) * st.w + (x + dx);
        if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
      }
    }
    expect(seen.size).toBe(cells.length);
  });

  it('巨石/压板族 tile 常量齐备(防 id 漂移)', () => {
    expect(BOULDER).toBeGreaterThan(0);
    expect(PLATE).toBeGreaterThan(0);
    expect(CHEST2).toBeGreaterThan(0);
    expect(TRACK_TILE).toBeGreaterThan(0);
  });
});
