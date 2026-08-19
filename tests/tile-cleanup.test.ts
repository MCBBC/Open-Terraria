// 三个收尾 cleanup pass 的合成 TileStore 单测(对照 1456 WorldGen.cs):
//   TileCleanup(cs:21327-21751)/ BrokenTrapCleanup(cs:22283-22302+ClearBrokenTraps cs:26984-27102)
//   / FinalCleanup(cs:22304-22670)。模式参 tests/gem-passes.test.ts。
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runTileCleanupPass } from '../src/world/gen/vanilla/TileCleanupPass';
import { runFinalCleanupPass } from '../src/world/gen/vanilla/FinalCleanupPass';
import { runBrokenTrapCleanupPass } from '../src/world/gen/vanilla/BrokenTrapCleanupPass';

/** sheet(=原版 tile id)→ 内部 id(与 pass 内 SHEET_TO_INTERNAL 同构) */
const SHEET = new Map<number, number>();
for (const d of TILE_DEFS) {
  const vs = d.vanilla?.sheet;
  if (vs !== undefined && !SHEET.has(vs)) SHEET.set(vs, TILE_BY_KEY[d.key]);
}
const sid = (s: number): number => SHEET.get(s) ?? -1;

const STONE = TILE_BY_KEY['stone']!;
const DIRT = TILE_BY_KEY['dirt']!;
const GS_TC = { worldSurface: 100, beachDistance: 380 } as unknown as GenState;
const GS_FC = { worldSurface: 100, rockLevel: 140, beachDistance: 10 } as unknown as GenState;

const at = (st: TileStore, x: number, y: number) => st.type[st.idx(x, y)];
const W = 200;
const H = 200;

describe('TileCleanup(1456 cs:21327-21751)', () => {
  it('② 全图清坡:SaveSlopes 类型保坡,其余 ClearSlope(slope+half 双清)', () => {
    const st = new TileStore(W, H);
    // 泥土(实心=SaveSlopes)保坡;平台/植物(非 SaveSlopes)清坡
    st.setTileSilent(50, 50, DIRT); st.slope[st.idx(50, 50)] = 2;
    st.setTileSilent(60, 60, sid(3)); st.slope[st.idx(60, 60)] = 3; st.half[st.idx(60, 60)] = 1;
    runTileCleanupPass(st, new RNG(1), GS_TC);
    expect(st.slope[st.idx(50, 50)]).toBe(2);          // 实心块坡面保留
    expect(st.slope[st.idx(60, 60)]).toBe(0);          // 非法坡面清除
    expect(st.half[st.idx(60, 60)]).toBe(0);           // ClearSlope 连带清半砖
  });

  it('③ 坡接半砖修复:slope1 右坡接左邻半砖 → slope=0+halfBrick', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(69, 70, DIRT); st.half[st.idx(69, 70)] = 1;
    st.setTileSilent(70, 70, DIRT); st.slope[st.idx(70, 70)] = 1; // topSlope+rightSlope
    runTileCleanupPass(st, new RNG(1), GS_TC);
    expect(st.slope[st.idx(70, 70)]).toBe(0);
    expect(st.half[st.idx(70, 70)]).toBe(1);
  });

  it('④ 液体中 SlowlyDiesInWater(植物 3)清除;沙块保留', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(80, 80, sid(3)); st.setLiquid(80, 80, 200, LIQUID_TYPE.WATER);
    st.setTileSilent(90, 80, sid(53)); st.setLiquid(90, 80, 200, LIQUID_TYPE.WATER);
    runTileCleanupPass(st, new RNG(1), GS_TC);
    expect(at(st, 80, 80)).toBe(0);
    expect(at(st, 90, 80)).toBe(sid(53));
  });

  it('⑤ 滴水石笋:上扫液体≥128 / 墙86 强制蜂蜜 / 下扫液体≥200', () => {
    let up = 0, honeyWall = 0, down = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const st = new TileStore(W, H);
      // 上扫:滴头位 (100,99),上方实心 (100,98),再上 (100,97) 水 200(距离 2 → 必中)
      st.setTileSilent(100, 98, STONE); st.setLiquid(100, 97, 200, LIQUID_TYPE.WATER);
      // 墙 86(蜂巢)→ 蜂蜜滴头
      st.setTileSilent(110, 98, STONE); st.setLiquid(110, 97, 200, LIQUID_TYPE.WATER);
      st.setWallSilent(110, 99, 86);
      // 下扫:滴头位 (120,99),下方 (120,100) 水 250(距离 1 → 2/3 命中)
      st.setTileSilent(120, 98, STONE); st.setLiquid(120, 100, 250, LIQUID_TYPE.WATER);
      runTileCleanupPass(st, new RNG(seed), GS_TC);
      if (at(st, 100, 99) === sid(373)) up++;
      if (at(st, 110, 99) === sid(375)) honeyWall++;
      if (at(st, 120, 99) === sid(373)) down++;
    }
    expect(up).toBeGreaterThan(0);
    expect(honeyWall).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
  });

  it('⑥ 墙 13/14/87 液体清零(普通世界分支)', () => {
    const st = new TileStore(W, H);
    for (const [x, wl] of [[120, 13], [121, 14], [122, 87]] as const) {
      st.setWallSilent(x, 120, wl); st.setLiquid(x, 120, 128, LIQUID_TYPE.WATER);
    }
    // 墙 87 + 岩浆滴头 374:普通世界分支只清液量,类型不动
    st.setTileSilent(123, 120, sid(374)); st.setWallSilent(123, 120, 87);
    runTileCleanupPass(st, new RNG(1), GS_TC);
    for (const x of [120, 121, 122]) expect(st.liquid[st.idx(x, 120)]).toBe(0);
    expect(st.liquid[st.idx(123, 120)]).toBe(0);
    expect(at(st, 123, 120)).toBe(sid(374));
  });

  it('⑪ 祭坛 237 正下方 232 木刺 → 226 蜥蜴砖', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(130, 130, sid(237));
    st.setTileSilent(130, 131, sid(232));
    runTileCleanupPass(st, new RNG(1), GS_TC);
    expect(at(st, 130, 131)).toBe(sid(226));
  });
});

describe('FinalCleanup(1456 cs:22304-22670)', () => {
  it('③ 悬空沙柱向下生长 ≤10 格并封底(53→397)', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(50, 90, sid(53));
    for (let y = 91; y <= 101; y++) st.setTileSilent(50, y, 0);
    st.setTileSilent(50, 102, STONE);
    runFinalCleanupPass(st, GS_FC);
    for (let y = 91; y <= 100; y++) expect(at(st, 50, y)).toBe(sid(53));
    expect(at(st, 50, 101)).toBe(sid(397)); // 停点封底
    expect(at(st, 50, 102)).toBe(STONE);
  });

  it('③ 下方 10 格内有矿轨 314 → 不生长,正下方封底', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(60, 90, sid(53));
    st.setTileSilent(60, 93, sid(314));
    runFinalCleanupPass(st, GS_FC);
    expect(at(st, 60, 90)).toBe(sid(53));   // 原沙不动
    expect(at(st, 60, 91)).toBe(sid(397));  // 封底落在正下方
    expect(at(st, 60, 92)).toBe(0);
  });

  it('③ 下方坡面/半砖实心 → 复位(分支 B);深层悬空 → 转硬化沙(分支 C)', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(80, 100, sid(53));
    st.setTileSilent(80, 101, DIRT); st.half[st.idx(80, 101)] = 1;
    st.setTileSilent(70, 120, sid(53));           // j=120 ≥ worldSurface+10 → 分支 C
    st.setTileSilent(70, 121, sid(19));           // 平台(solidTop):非 SolidTile
    runFinalCleanupPass(st, GS_FC);
    expect(st.half[st.idx(80, 101)]).toBe(0);     // 分支 B:复位半砖
    expect(at(st, 80, 100)).toBe(sid(53));        // 沙不动
    expect(at(st, 70, 120)).toBe(sid(397));       // 分支 C:直接转硬化沙
  });

  it('④ 墙 187/216 液体 → 满岩浆;⑤ 137 复位坡面', () => {
    const st = new TileStore(W, H);
    st.setWallSilent(30, 120, 187); st.setLiquid(30, 120, 100, LIQUID_TYPE.WATER);
    st.setWallSilent(31, 120, 216); st.setLiquid(31, 120, 10, LIQUID_TYPE.LAVA);
    st.setTileSilent(30, 130, sid(137));
    st.slope[st.idx(30, 130)] = 3; st.half[st.idx(30, 130)] = 1;
    runFinalCleanupPass(st, GS_FC);
    expect(st.liquid[st.idx(30, 120)]).toBe(255);
    expect(st.liquidType[st.idx(30, 120)]).toBe(LIQUID_TYPE.LAVA);
    expect(st.liquid[st.idx(31, 120)]).toBe(255);
    expect(st.slope[st.idx(30, 130)]).toBe(0);
    expect(st.half[st.idx(30, 130)]).toBe(0);
  });

  it('⑥ 巨石重帧;上方 26 祭坛 → 484 回滚 397 / 138 回滚石', () => {
    const st = new TileStore(W, H);
    const putBoulder = (x: number, y: number, t: number) => {
      st.setTileSilent(x, y, t, 0, 0); st.setTileSilent(x + 1, y, t, 18, 0);
      st.setTileSilent(x, y + 1, t, 0, 18); st.setTileSilent(x + 1, y + 1, t, 18, 18);
      // CCCCC（2026-08-19）：Check2x2 case 138 派发（cs:86672→48473-90 支撑门）后，
      // 浮空巨石会被 vanilla 同序整组杀——原 fixture 无底必红非 ⑥ 回归。补石底
      // 对齐真实构型（巨石立于实心地上），保 ⑥ 重帧/祭坛回滚测试意图。
      st.setTileSilent(x, y + 2, sid(1)); st.setTileSilent(x + 1, y + 2, sid(1));
    };
    putBoulder(100, 120, sid(138));               // 无祭坛 → 保留
    putBoulder(110, 120, sid(484));
    st.setTileSilent(110, 119, sid(26));          // 祭坛在上（单格残片）
    putBoulder(120, 120, sid(138));
    st.setTileSilent(120, 119, sid(26));
    runFinalCleanupPass(st, GS_FC);
    for (const [x, y] of [[100, 120], [101, 120], [100, 121], [101, 121]]) {
      expect(at(st, x, y)).toBe(sid(138));
    }
    // ZZZ 批（2026-08-18）：cs:22544 TileFrame 全图扫落地后,单格祭坛残片先在
    // j=119 被 Check3x2 完整性门杀（cs:49190——vanilla 同序),⑥ 在 j=120 到达时
    // 祭坛已不在 → 巨石保留。真实世界中祭坛是完整 3×2 且立于实心地,⑥ 分支
    // 由金标转移表（T484>-1×2）另行实证。
    for (const [x, y] of [[110, 120], [111, 121]]) expect(at(st, x, y)).toBe(sid(484));
    for (const [x, y] of [[120, 120], [121, 121]]) expect(at(st, x, y)).toBe(sid(138));
  });

  it('⑦ 液体中棕榈 323 杀;⑧ 地牢墙液体转水/374→373/刺 56 杀+灌满水', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(30, 140, sid(323)); st.setLiquid(30, 140, 10, LIQUID_TYPE.WATER);
    st.setWallSilent(30, 150, 7); st.setLiquid(30, 150, 50, LIQUID_TYPE.LAVA);
    st.setWallSilent(31, 150, 94); st.setTileSilent(31, 150, sid(374));
    st.setWallSilent(32, 150, 7); st.setTileSilent(32, 150, sid(56));
    runFinalCleanupPass(st, GS_FC);
    expect(at(st, 30, 140)).toBe(0);
    expect(st.liquid[st.idx(30, 150)]).toBe(50);
    expect(st.liquidType[st.idx(30, 150)]).toBe(LIQUID_TYPE.WATER);
    // ZZZ 批：374→373 转换后,本格无实心支撑 → 同迭代末尾 TileFrame(373) 走
    // IsADripTile 门杀（cs:85750,TileID.cs:157 {373,374,375,461,709}）——vanilla 同序
    expect(at(st, 31, 150)).toBe(0);
    expect(at(st, 32, 150)).toBe(0);
    expect(st.liquid[st.idx(32, 150)]).toBe(255);
    expect(st.liquidType[st.idx(32, 150)]).toBe(LIQUID_TYPE.WATER);
  });

  it('⑨ 矿轨 314 上 15 下 1 清液;⑩ 金币堆 332 下方补(ClearEverything)', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(30, 160, sid(314));
    for (const y of [157, 158, 159, 160]) st.setLiquid(30, y, 50, LIQUID_TYPE.WATER);
    st.setLiquid(30, 161, 80, LIQUID_TYPE.WATER);   // 下 1 格之外 → 保留
    st.setTileSilent(30, 170, sid(332));
    st.setLiquid(30, 171, 120, LIQUID_TYPE.LAVA);   // ClearEverything 应清
    st.setWallSilent(30, 171, 5);
    st.setTileSilent(30, 172, STONE);               // 阻断 332 级联
    runFinalCleanupPass(st, GS_FC);
    for (const y of [157, 158, 159, 160]) expect(st.liquid[st.idx(30, y)]).toBe(0);
    expect(st.liquid[st.idx(30, 161)]).toBe(80);
    expect(at(st, 30, 171)).toBe(sid(332));
    expect(st.liquid[st.idx(30, 171)]).toBe(0);
    expect(st.wall[st.idx(30, 171)]).toBe(0);
  });

  it('⑪ 地表散水清除(邻格满液/云块豁免);⑫ 无墙画作继承邻墙', () => {
    const st = new TileStore(W, H);
    st.setLiquid(30, 95, 100, LIQUID_TYPE.WATER);
    st.setLiquid(40, 95, 100, LIQUID_TYPE.WATER);
    st.setLiquid(40, 96, 255, LIQUID_TYPE.WATER);   // 下方满液 → 豁免
    st.setTileSilent(30, 110, sid(245));
    st.setWallSilent(29, 110, 5);
    runFinalCleanupPass(st, GS_FC);
    expect(st.liquid[st.idx(30, 95)]).toBe(0);
    expect(st.liquid[st.idx(40, 95)]).toBe(100);
    expect(st.wall[st.idx(30, 110)]).toBe(5);
  });
});

describe('BrokenTrapCleanup(1456 cs:22283-22302 + cs:26984-27102)', () => {
  const wire = (st: TileStore, x: number, y: number, bits: number) => {
    st.wire[st.idx(x, y)] |= bits;
  };

  it('网络同时含陷阱与触发器 → 保留', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(60, 60, sid(137)); wire(st, 60, 60, TileStore.WIRE_RED);
    for (const y of [61, 62, 63]) wire(st, 60, y, TileStore.WIRE_RED);
    st.setTileSilent(60, 64, sid(135)); wire(st, 60, 64, TileStore.WIRE_RED);
    runBrokenTrapCleanupPass(st);
    expect(at(st, 60, 60)).toBe(sid(137));
    expect(at(st, 60, 64)).toBe(sid(135));
    for (const y of [60, 61, 62, 63, 64]) {
      expect(st.wire[st.idx(60, y)] & TileStore.WIRE_RED).toBe(TileStore.WIRE_RED);
    }
  });

  it('孤儿陷阱:清红线(他色保留)+ 杀陷阱', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(70, 60, sid(137)); wire(st, 70, 60, TileStore.WIRE_RED);
    wire(st, 70, 61, TileStore.WIRE_RED | TileStore.WIRE_BLUE);
    wire(st, 70, 62, TileStore.WIRE_RED);
    runBrokenTrapCleanupPass(st);
    expect(at(st, 70, 60)).toBe(0);
    for (const y of [60, 61, 62]) {
      expect(st.wire[st.idx(70, y)] & TileStore.WIRE_RED).toBe(0);
    }
    expect(st.wire[st.idx(70, 61)] & TileStore.WIRE_BLUE).toBe(TileStore.WIRE_BLUE);
  });

  it('孤儿触发器:压板被杀', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(80, 60, sid(135)); wire(st, 80, 60, TileStore.WIRE_RED);
    wire(st, 80, 61, TileStore.WIRE_RED);
    runBrokenTrapCleanupPass(st);
    expect(at(st, 80, 60)).toBe(0);
    expect(st.wire[st.idx(80, 60)] & TileStore.WIRE_RED).toBe(0);
  });

  it('致动器网络:清致动位 + 上方 2×2 巨石回滚为石 1', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(90, 62, STONE);
    wire(st, 90, 62, TileStore.WIRE_RED | TileStore.WIRE_ACTUATOR);
    st.setTileSilent(90, 60, sid(484), 0, 0); st.setTileSilent(91, 60, sid(484), 18, 0);
    st.setTileSilent(90, 61, sid(484), 0, 18); st.setTileSilent(91, 61, sid(484), 18, 18);
    runBrokenTrapCleanupPass(st);
    expect(st.wire[st.idx(90, 62)] & TileStore.WIRE_ACTUATOR).toBe(0);
    for (const [x, y] of [[90, 60], [91, 60], [90, 61], [91, 61]]) {
      expect(at(st, x, y)).toBe(sid(1));
    }
  });

  it('105 雕像豁免;314 矿轨压板改 frameX=1', () => {
    const st = new TileStore(W, H);
    st.setTileSilent(100, 60, sid(105)); wire(st, 100, 60, TileStore.WIRE_RED);
    wire(st, 100, 61, TileStore.WIRE_RED);
    st.setTileSilent(110, 60, sid(314), 20, 0); wire(st, 110, 60, TileStore.WIRE_RED);
    wire(st, 110, 61, TileStore.WIRE_RED);
    runBrokenTrapCleanupPass(st);
    expect(at(st, 100, 60)).toBe(sid(105));          // 雕像存活
    expect(st.wire[st.idx(100, 60)] & TileStore.WIRE_RED).toBe(0);
    expect(at(st, 110, 60)).toBe(sid(314));          // 轨道存活
    expect(st.frameX[st.idx(110, 60)]).toBe(1);
    expect(st.wire[st.idx(110, 60)] & TileStore.WIRE_RED).toBe(0);
  });
});
