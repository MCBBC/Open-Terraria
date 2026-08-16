// 内容区缺口修复批（2026-08-16，任务 #26）回归测试：
//  #68 UndergroundJungleTrees（GrowUndergroundTree cs:31007 直调单元）
//  #70 QuickCleanup（五子段直调单元）
// 原版源码 = Terarria1456/Terraria/WorldGen.cs；掷序=cs 实参左→右。
import { describe, it, expect } from 'vitest';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { newGenState } from '../src/world/gen/vanilla/GenState';
import { RNG } from '../src/core/rng';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { growUndergroundTree } from '../src/world/gen/vanilla/UndergroundJungleTreesPass';
import { runQuickCleanupPass } from '../src/world/gen/vanilla/QuickCleanupPass';

const SHEET = new Map<number, number>();
for (const d of TILE_DEFS) {
  const vs = d.vanilla?.sheet;
  if (vs !== undefined && !SHEET.has(vs)) SHEET.set(vs, TILE_BY_KEY[d.key]);
}
const sid = (s: number) => SHEET.get(s) ?? -1;
const TREE = sid(5), JG = sid(60), MUD = sid(59), SILT = sid(123), SLUSH = sid(224),
  MARBLE = sid(367), GRANITE = sid(368), HARDSAND = sid(397), SAND = sid(53),
  DIRT = sid(0) /* 原版 type 0=泥土（内部 T.DIRT=1） */, STONE = sid(1), DART_TRAP = sid(137);

function mkGs(w: number, h: number, worldSurface: number, rockLevel: number) {
  const gs = newGenState(w, h);
  gs.worldSurface = worldSurface;
  gs.rockLevel = rockLevel;
  gs.beachDistance = 380;
  return gs;
}

describe('#68 UndergroundJungleTrees：GrowUndergroundTree 单元', () => {
  it('丛林草基座成树：干身连续/树冠帧/基座帧/genTrees 登记（高度=Next(5,15)）', () => {
    const st = new TileStore(120, 260);
    const gs = mkGs(120, 260, 80, 140);
    // 丛林草基座 + 左邻（入场门 cs:31009：左右邻至少一侧 active 丛林草）
    st.setTileSilent(59, 200, JG);
    st.setTileSilent(60, 200, JG);
    const seed = 20260816;
    growUndergroundTree(st, new RNG(seed), gs, 60, 200);
    const expH = new RNG(seed).int(5, 14); // 高度掷在 EmptyTileCheck 之前（cs:31014）
    // 干身连续：[y-h, y-1] 全是 Tiles_5，帧网格 22px 对齐
    for (let y = 200 - expH; y < 200; y++) {
      const i = st.idx(60, y);
      expect(st.flags[i], `干身 (60,${y})`).toBe(1);
      expect(st.type[i]).toBe(TREE);
      expect(st.frameX[i] % 22).toBe(0);
      expect(st.frameY[i] % 22).toBe(0);
    }
    // 树冠标记帧（cs:31414-31451：fy=198+22k）
    const top = st.idx(60, 200 - expH);
    expect(st.frameY[top]).toBeGreaterThanOrEqual(198);
    expect(st.frameY[top]).toBeLessThanOrEqual(242);
    // 基座上一格（y-1）为干身末段（cs:31027 循环含 y-1）
    expect(st.type[st.idx(60, 199)]).toBe(TREE);
    // 登记表：{x, y=树顶, h}（t.y+t.h === 基座行，砍伐整棵判定用）
    const reg = gs.genTrees[gs.genTrees.length - 1];
    expect(reg).toEqual({ x: 60, y: 200 - expH, h: expH });
    expect(reg.y + reg.h).toBe(200);
    // 基座本身未被覆盖
    expect(st.type[st.idx(60, 200)]).toBe(JG);
  });

  it('入场门拒绝：非丛林草基座 / 无丛林草邻 / 净空盒内实心 → 零写入零登记', () => {
    // A. 基座非丛林草（泥）
    const stA = new TileStore(120, 260);
    const gsA = mkGs(120, 260, 80, 140);
    stA.setTileSilent(59, 200, JG);
    stA.setTileSilent(60, 200, MUD);
    growUndergroundTree(stA, new RNG(1), gsA, 60, 200);
    expect(gsA.genTrees.length).toBe(0);
    expect(stA.type[stA.idx(60, 199)]).toBe(0);

    // B. 基座丛林草但左右邻皆空
    const stB = new TileStore(120, 260);
    stB.setTileSilent(60, 200, JG);
    growUndergroundTree(stB, new RNG(1), gsA, 60, 200);
    expect(gsA.genTrees.length).toBe(0);

    // C. 净空盒 [y-(h+7), y-1] 内实心 → EmptyTileCheck 拒（盒顶最深 200-21=179，
    //    y∈[188,199] 对任意 h∈[5,14] 恒在盒内，实心石放 195）
    const stC = new TileStore(120, 260);
    const gsC = mkGs(120, 260, 80, 140);
    stC.setTileSilent(59, 200, JG);
    stC.setTileSilent(60, 200, JG);
    stC.setTileSilent(60, 195, STONE);
    growUndergroundTree(stC, new RNG(1), gsC, 60, 200);
    expect(gsC.genTrees.length).toBe(0);
    expect(stC.type[stC.idx(60, 199)]).toBe(0);
  });
});

describe('#70 QuickCleanup：五子段单元', () => {
  it('(a) 海洋带非水液体 → 水；(b) 表面沙下填土 3-5 格', () => {
    const st = new TileStore(300, 300);
    const gs = mkGs(300, 300, 100, 160);
    const x = 30; // 主循环 i∈[20,w-20)；w=300<beachDistance*2 → 全列皆海洋带，
    //              海洋层 = (100+160)/2+40 = 170
    st.setLiquid(x, 60, 100, LIQUID_TYPE.HONEY);   // 带内蜂蜜
    st.setLiquid(x, 200, 100, LIQUID_TYPE.HONEY);  // y=200 > 170 带外不动
    // (b)：表面沙（j=90 < worldSurface=100），下方 6 格空再石
    st.setTileSilent(x, 90, SAND);
    st.setTileSilent(x, 97, STONE);
    runQuickCleanupPass(st, new RNG(7), gs);
    expect(st.liquidType[st.idx(x, 60)]).toBe(LIQUID_TYPE.WATER);   // (a) 带内转水
    expect(st.liquidType[st.idx(x, 200)]).toBe(LIQUID_TYPE.HONEY);  // 带外不动
    // (b)：沙下 3-5 格填成泥土（Next(4,7)∈[4,6] → 填 k∈[91, 90+r)）
    let dirt = 0;
    for (let k = 91; k <= 96; k++) {
      if (st.flags[st.idx(x, k)] && st.type[st.idx(x, k)] === DIRT) dirt++;
    }
    expect(dirt).toBeGreaterThanOrEqual(3);
    expect(dirt).toBeLessThanOrEqual(5);
    expect(st.type[st.idx(x, 97)]).toBe(STONE);                     // 石不被覆盖
  });

  it('(b) 停止条件：k+1 沙族 → 当格不填；k+2 沙族 → 填一格即停（cs:18015 展望窗）', () => {
    const st = new TileStore(300, 300);
    const gs = mkGs(300, 300, 100, 160);
    const x = 30;
    // 情形一：k+1=92 是沙 → k=91 的条件判定即失败，一格都不填
    st.setTileSilent(x, 90, SAND);
    st.setTileSilent(x, 92, SAND);
    runQuickCleanupPass(st, new RNG(7), gs);
    expect(st.flags[st.idx(x, 91)]).toBe(0);     // 未填（k+1 展望命中）
    expect(st.type[st.idx(x, 92)]).toBe(SAND);

    // 情形二：k+2=94 是沙 → 填 91 一格后 k=92 停（k+2 展望命中）
    const st2 = new TileStore(300, 300);
    st2.setTileSilent(x, 90, SAND);
    st2.setTileSilent(x, 94, SAND);
    runQuickCleanupPass(st2, new RNG(7), gs);
    expect(st2.flags[st2.idx(x, 91)]).toBe(1);
    expect(st2.type[st2.idx(x, 91)]).toBe(DIRT);
    expect(st2.flags[st2.idx(x, 92)]).toBe(0);   // k=92 未填（k+2 展望命中）
    expect(st2.type[st2.idx(x, 94)]).toBe(SAND);
  });

  it('(c) 沙岩墙 187/硬化沙墙 216：泥/淤泥/雪泥/花岗/大理石 → 硬化沙；浅干深岩浆', () => {
    const st = new TileStore(300, 300);
    const gs = mkGs(300, 300, 100, 160);
    // 浅层（j=150 <= rockLevel=160）：泥→硬化沙 + 液体清零
    st.setTileSilent(150, 150, MUD);
    st.wall[st.idx(150, 150)] = 187;
    st.setLiquid(150, 150, 80, LIQUID_TYPE.WATER);
    // 深层（j=200 > rockLevel）：花岗 → 硬化沙 + 液体满格岩浆
    st.setTileSilent(150, 200, GRANITE);
    st.wall[st.idx(150, 200)] = 216;
    st.setLiquid(150, 200, 30, LIQUID_TYPE.WATER);
    st.setTileSilent(150, 220, SILT); st.wall[st.idx(150, 220)] = 187;   // 淤泥
    st.setTileSilent(150, 230, SLUSH); st.wall[st.idx(150, 230)] = 187;  // 雪泥
    st.setTileSilent(150, 240, MARBLE); st.wall[st.idx(150, 240)] = 216; // 大理石
    st.setTileSilent(151, 150, MUD);                                     // 无墙对照
    runQuickCleanupPass(st, new RNG(7), gs);
    expect(st.type[st.idx(150, 150)]).toBe(HARDSAND);
    expect(st.liquid[st.idx(150, 150)]).toBe(0);                    // j<=rockLayer 清液
    expect(st.type[st.idx(150, 200)]).toBe(HARDSAND);
    expect(st.liquid[st.idx(150, 200)]).toBe(255);                  // 深层满液
    expect(st.liquidType[st.idx(150, 200)]).toBe(LIQUID_TYPE.LAVA); // 转岩浆
    expect(st.type[st.idx(150, 220)]).toBe(HARDSAND);
    expect(st.type[st.idx(150, 230)]).toBe(HARDSAND);
    expect(st.type[st.idx(150, 240)]).toBe(HARDSAND);
    expect(st.type[st.idx(151, 150)]).toBe(MUD);                    // 无墙不动
  });

  it('(e) SaveSlopes 归一：无支撑半砖清除/有支撑保留/bottomSlope 无上方支撑清除/邻机关陷阱清除', () => {
    const st = new TileStore(300, 300);
    const gs = mkGs(300, 300, 100, 160);
    // 半砖泥土、下方空 → 清除（cs:18076-18087：topSlope||halfBrick 查下方 SolidTile）
    st.setTileSilent(100, 100, DIRT);
    st.setHalfBrick(100, 100, true);
    // 半砖泥土、下方石头 → 保留（半砖本身保留）
    st.setTileSilent(101, 100, DIRT);
    st.setHalfBrick(101, 100, true);
    st.setTileSilent(101, 101, STONE);
    // 石头 bottomSlope(3)、上方空 → 清除（bottomSlope 分支查上方 SolidTile(i, j-1)）
    st.setTileSilent(102, 100, STONE);
    st.setSlope(102, 100, 3);
    st.setTileSilent(102, 101, STONE); // 下方实心（bottomSlope 分支不查下方）
    // 石头 topSlope(1)、下方实心 → 保留（坡位保留：石头 ∈ SaveSlopes）
    st.setTileSilent(103, 100, STONE);
    st.setSlope(103, 100, 1);
    st.setTileSilent(103, 101, STONE);
    // 半砖泥土、下方有支撑、右邻机关陷阱 137 → 清除（cs:18084-18087）
    st.setTileSilent(104, 100, DIRT);
    st.setHalfBrick(104, 100, true);
    st.setTileSilent(104, 101, STONE);
    st.setTileSilent(105, 100, DART_TRAP);
    runQuickCleanupPass(st, new RNG(7), gs);
    expect(st.flags[st.idx(100, 100)]).toBe(0);   // 无支撑半砖清除
    expect(st.flags[st.idx(101, 100)]).toBe(1);   // 有支撑保留
    expect(st.half[st.idx(101, 100)]).toBe(1);
    expect(st.flags[st.idx(102, 100)]).toBe(0);   // bottomSlope 无上方支撑清除
    expect(st.flags[st.idx(103, 100)]).toBe(1);   // topSlope 有下方实心保留
    expect(st.slope[st.idx(103, 100)]).toBe(1);   // SaveSlopes 类型坡位保留
    expect(st.flags[st.idx(104, 100)]).toBe(0);   // 邻机关陷阱半砖清除
    expect(st.flags[st.idx(105, 100)]).toBe(1);   // 陷阱本体不动
  });
});
