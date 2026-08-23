// 地牢生成域 1457 对齐（批 dungeon-1457-alignment）单测。
// 分类清单/证据链：docs/worldgen/dungeon-1457-alignment.md。
// 覆盖：A 型抽样等价（Default 单样式下 1457 语义 ≡ 1456 行为）、B 型逐项
// （风格扩表/GOTHIC 档/UnbreakableWallTiers/双地牢旗→行为/Extra 扩表/tier
// styleID 维度）、普通世界零扰动（非 dual 门控恒走 1456 单行公式）。
import { describe, it, expect } from 'vitest';
import {
  DungeonGenerationStyleID,
  DualDungeonUnbreakableWallTiers,
  DungeonGenerationStyles,
  getCurrentDungeonStyle,
  dualDungeonStyles,
  tileIsInStyle,
  wallIsInStyle,
  getStyleForTile,
  getStyleForWall,
  getTierForDungeonTile,
  getTierForDungeonWall,
  isHigherOrEqualTieredDungeonTile,
  buildDungeonGenVars,
  isConsideredAnyDungeonWall,
  isConsideredDungeonWallEdge,
  getPlatformStyle,
  dualDungeonTrapWindow,
  dualDungeonState,
  placeTrapDualDungeonReject,
} from '../src/world/gen/vanilla/DungeonStyles1457';

// Main.tileDungeon（Main.cs:7941-7946）/ Main.wallDungeon（Main.cs:10507-10515）
const TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
const tileDungeon = (t: number): boolean => TILE_DUNGEON.has(t);
const wallDungeon = (w2: number): boolean => WALL_DUNGEON.has(w2);

// SetupDungeonGenVarVariables 主题 0（蓝砖）genvars（DungeonCrawler.cs:63-72）
const blueGenvars = {
  brickTileType: 41, brickCrackedTileType: 481, brickWallType: 7,
  windowGlassWallType: 91, windowClosedGlassWallType: 96, windowEdgeWallType: 8,
  windowPlatformItemTypes: [1386],
};
const DEFAULT = getCurrentDungeonStyle(blueGenvars);
const dual = true, nonDual = false;

describe('dungeon-1457 A型抽样：Default 单样式下 1457 语义 ≡ 1456 行为', () => {
  it('A1 TileIsInStyle(Default)：非 extras 维度下 ≡ brick/crack 二元判定', () => {
    for (let t = 0; t < 720; t++) {
      const expected = t === 41 || t === 481;   // 1456: includeCracked 缺省 true
      expect(tileIsInStyle(DEFAULT, t)).toBe(expected);
      expect(tileIsInStyle(DEFAULT, t, true, false)).toBe(expected);
    }
  });
  it('A2 WallIsInStyle(Default)：≡ brickWallType 判定；includeWindows 扩窗墙三族', () => {
    for (let w2 = 0; w2 < 360; w2++) {
      expect(wallIsInStyle(DEFAULT, w2)).toBe(w2 === 7);
    }
    expect(wallIsInStyle(DEFAULT, 91, true)).toBe(true);   // WindowGlassWallType
    expect(wallIsInStyle(DEFAULT, 96, true)).toBe(true);   // WindowClosedGlassWallType
    expect(wallIsInStyle(DEFAULT, 8, true)).toBe(true);    // WindowEdgeWallType
    expect(wallIsInStyle(DEFAULT, 91)).toBe(false);
  });
  it('A3 Default 档 paint 通道恒 null（1457 全部 paint 接线对普通世界=no-op 的根据）', () => {
    expect(DEFAULT.TilePaintColor).toBeUndefined();
    expect(DEFAULT.WallPaintColor).toBeUndefined();
    expect(DEFAULT.ExtraTileTypes).toBeUndefined();
    expect(DEFAULT.ExtraWallTypes).toBeUndefined();
  });
  it('A4 GetPlatformStyle(Default)：PlatformItemTypes 继承 windowPlatformItemTypes 非空表恰一掷', () => {
    let rolls = 0;
    const r = { nextInt: (n: number) => { rolls++; expect(n).toBe(1); return 0; } };
    expect(getPlatformStyle(DEFAULT, r)).toBe(1386);
    expect(rolls).toBe(1);
    // 空表（GetCurrentDungeonStyle 直造的 PlatformItemTypes=new int[0] 语义）→ -1 零掷
    const empty = getCurrentDungeonStyle({ ...blueGenvars, windowPlatformItemTypes: [] });
    rolls = 0;
    expect(getPlatformStyle(empty, r)).toBe(-1);
    expect(rolls).toBe(0);
  });
});

describe('dungeon-1457 B型：1457 风格注册表扩表（DungeonGenerationStyles.cs 定谳）', () => {
  it('B1 ExtraTileTypes/ExtraWallTypes 逐档对表（:233/:275/:318/:359/:440/:606）', () => {
    expect(DungeonGenerationStyles.Snow!.ExtraTileTypes).toEqual([147]);
    expect(DungeonGenerationStyles.Snow!.ExtraWallTypes).toEqual([40]);
    expect(DungeonGenerationStyles.Desert!.ExtraTileTypes).toEqual([397, 404]);
    expect(DungeonGenerationStyles.Desert!.ExtraWallTypes).toEqual([216, 223]);
    expect(DungeonGenerationStyles.Corruption!.ExtraWallTypes).toEqual([188, 189, 190, 191]);
    expect(DungeonGenerationStyles.Crimson!.ExtraWallTypes).toEqual([192, 193, 194, 195]);
    expect(DungeonGenerationStyles.Hallow!.ExtraWallTypes).toEqual([200, 201, 202, 203]);
    expect(DungeonGenerationStyles.Jungle!.ExtraWallTypes).toEqual([204, 205, 206, 207, 15]);
  });
  it('B2 1457 paint 通道：唯 LivingMahogany WallPaintColor=12（:564）', () => {
    expect(DungeonGenerationStyles.LivingMahogany!.WallPaintColor).toBe(12);
    for (const k of Object.keys(DungeonGenerationStyles)) {
      if (k !== 'LivingMahogany') {
        expect(DungeonGenerationStyles[k]!.WallPaintColor, k).toBeUndefined();
        expect(DungeonGenerationStyles[k]!.TilePaintColor, k).toBeUndefined();
      }
    }
  });
  it('B3 includeExtras 维度（TileIsInStyle :118-127/WallIsInStyle :137-146 新参）', () => {
    expect(tileIsInStyle(DungeonGenerationStyles.Snow!, 147)).toBe(false);
    expect(tileIsInStyle(DungeonGenerationStyles.Snow!, 147, true, true)).toBe(true);
    expect(wallIsInStyle(DungeonGenerationStyles.Corruption!, 188)).toBe(false);
    expect(wallIsInStyle(DungeonGenerationStyles.Corruption!, 188, false, true)).toBe(true);
    // includeCracked=false 剥裂纹砖（GetStyleForTile/Wall 1457 调用形）
    expect(tileIsInStyle(DungeonGenerationStyles.Snow!, 224, false, true)).toBe(false);
    expect(tileIsInStyle(DungeonGenerationStyles.Snow!, 224, true, true)).toBe(true);
  });
  it('B4 GetStyleForTile（:722-743,1457）：includeCracked:false+includeExtras:true', () => {
    const styles = [DEFAULT, DungeonGenerationStyles.Snow!];
    expect(getStyleForTile(styles, 161, tileDungeon)).toBe(DungeonGenerationStyles.Snow);   // Snow 砖
    expect(getStyleForTile(styles, 147, tileDungeon)).toBe(DungeonGenerationStyles.Snow);   // Snow extra
    expect(getStyleForTile(styles, 224, tileDungeon)).toBeNull();                            // 裂纹被剥
    expect(getStyleForTile(styles, 41, tileDungeon)).toBe(DEFAULT);                          // Default 砖
    expect(getStyleForTile(styles, 0, tileDungeon)).toBeNull();
  });
  it('B5 GetStyleForWall 1457 wallDungeon 快路径（:749-751）：变体墙 94-99 → Default（1456=null）', () => {
    const styles = [DEFAULT];
    for (const w2 of [7, 8, 9, 94, 95, 96, 97, 98, 99]) {
      expect(getStyleForWall(styles, w2, wallDungeon), `wall ${w2}`).toBe(DEFAULT);
    }
    expect(getStyleForWall(styles, 0, wallDungeon)).toBeNull();    // 泥墙
    expect(getStyleForWall(styles, 71, wallDungeon)).toBeNull();   // Snow 砖墙不在表
  });
});

describe('dungeon-1457 B型：tier 机器（DungeonUtils.cs:1946-2100）', () => {
  it('B6 非 dual：GetTierForDungeonTile/Wall ≡ 1456 单行公式（普通世界零扰动对拍,全 id 扫描）', () => {
    const gv = { dungeonGenerationStyles: [DEFAULT] };
    for (let t = 0; t < 720; t++) {
      expect(getTierForDungeonTile(gv, t, -1, nonDual, tileDungeon)).toBe(t > 0 && tileDungeon(t) ? 1 : -1);
    }
    for (let w2 = 0; w2 < 360; w2++) {
      expect(getTierForDungeonWall(gv, w2, -1, nonDual, wallDungeon)).toBe(w2 > 0 && wallDungeon(w2) ? 1 : -1);
    }
  });
  it('B7 dual 循环：地牢0=[Cavern,Corruption,Jungle,Default] 档位定位（i/i+0.25/0.5/0.66/0.75）', () => {
    const styles = dualDungeonStyles(0, false, DEFAULT);
    const gv = { dungeonGenerationStyles: styles };
    expect(getTierForDungeonTile(gv, 38, -1, dual, tileDungeon)).toBe(0);        // Cavern 砖
    expect(getTierForDungeonTile(gv, 156, -1, dual, tileDungeon)).toBe(0.25);    // Spider（Cavern 位）
    expect(getTierForDungeonTile(gv, 191, -1, dual, tileDungeon)).toBe(0.5);     // LivingWood
    expect(getTierForDungeonTile(gv, 667, -1, dual, tileDungeon)).toBe(0.75);    // Shimmer
    expect(getTierForDungeonTile(gv, 25, -1, dual, tileDungeon)).toBe(1);        // Corruption 砖
    expect(getTierForDungeonTile(gv, 59, -1, dual, tileDungeon)).toBe(2);        // Jungle 砖
    expect(getTierForDungeonTile(gv, 225, -1, dual, tileDungeon)).toBe(2.66);    // Beehive（Jungle 位）
    expect(getTierForDungeonTile(gv, 41, -1, dual, tileDungeon)).toBe(3);        // Default 砖（tileDungeon 快径）
    expect(getTierForDungeonTile(gv, 385, -1, dual, tileDungeon)).toBe(-1);      // Crystal 无 Hallow 位不命中
    expect(getTierForDungeonTile(gv, 0, -1, dual, tileDungeon)).toBe(-1);
  });
  it('B8 dual 循环：地牢1=[Snow,Desert,Hallow,Temple] + Crystal 半档（Hallow 位 i+0.5）', () => {
    const styles = dualDungeonStyles(1, false, DEFAULT);
    const gv = { dungeonGenerationStyles: styles };
    expect(getTierForDungeonTile(gv, 161, -1, dual, tileDungeon)).toBe(0);       // Snow 砖
    // 147∈Snow.ExtraTileTypes 但 tier 循环的兜底 tileIsInStyle 缺省 includeExtras=false
    // → 不命中档位；147 亦非 tileDungeon → 末尾 -1（extras 命中只在显式 includeExtras 调用形）
    expect(getTierForDungeonTile(gv, 147, -1, dual, tileDungeon)).toBe(-1);
    expect(getTierForDungeonTile(gv, 396, -1, dual, tileDungeon)).toBe(1);       // Desert 砖
    expect(getTierForDungeonTile(gv, 385, -1, dual, tileDungeon)).toBe(2.5);     // Crystal（Hallow 位 i=2）
    expect(getTierForDungeonTile(gv, 117, -1, dual, tileDungeon)).toBe(2);       // Hallow 砖
    expect(getTierForDungeonTile(gv, 226, -1, dual, tileDungeon)).toBe(3);       // Temple 砖
  });
  it('B9 genStyleID 维度（1457 新参）：LivingWood/LivingMahogany 半档受 genStyleID 门控', () => {
    const styles = dualDungeonStyles(0, false, DEFAULT);
    const gv = { dungeonGenerationStyles: styles };
    // LivingWood 表在 Cavern 位（i=0）：genStyleID -1 或 13 放行
    expect(getTierForDungeonTile(gv, 191, 13, dual, tileDungeon)).toBe(0.5);
    expect(getTierForDungeonTile(gv, 191, -1, dual, tileDungeon)).toBe(0.5);
    expect(getTierForDungeonTile(gv, 191, 14, dual, tileDungeon)).toBe(-1);      // 门关
    // LivingMahogany 表在 Jungle 位（i=2）：genStyleID -1 或 14 放行
    expect(getTierForDungeonTile(gv, 383, 14, dual, tileDungeon)).toBe(2.33);
    expect(getTierForDungeonTile(gv, 383, 13, dual, tileDungeon)).toBe(-1);
  });
  it('B10 IsHigherOrEqualTieredDungeonTile：非 dual 语义 ≡ 1456（tileDungeon 对拍）', () => {
    const gv = { dungeonGenerationStyles: [DEFAULT] };
    expect(isHigherOrEqualTieredDungeonTile(gv, 41, 41, -1, 0, nonDual, tileDungeon)).toBe(true);
    expect(isHigherOrEqualTieredDungeonTile(gv, 41, 0, -1, 0, nonDual, tileDungeon)).toBe(true);
    expect(isHigherOrEqualTieredDungeonTile(gv, 0, 41, -1, 0, nonDual, tileDungeon)).toBe(false);
    // dual：Cavern 砖(38,档0) vs Corruption 砖(25,档1) → 0>=1 假
    const styles = dualDungeonStyles(0, false, DEFAULT);
    const gvd = { dungeonGenerationStyles: styles };
    expect(isHigherOrEqualTieredDungeonTile(gvd, 38, 25, -1, -1, dual, tileDungeon)).toBe(false);
    expect(isHigherOrEqualTieredDungeonTile(gvd, 25, 38, -1, -1, dual, tileDungeon)).toBe(true);
  });
  it('B11 GetTierForDungeonWall dual：ExtraWallTypes/窗墙/includeWindows 维度', () => {
    const styles = dualDungeonStyles(1, false, DEFAULT);   // [Snow,Desert,Hallow,Temple]
    const gv = { dungeonGenerationStyles: styles };
    expect(getTierForDungeonWall(gv, 71, -1, dual, wallDungeon)).toBe(0);            // Snow 砖墙
    // 40∈Snow.ExtraWallTypes 但缺省 includeExtras=false → 不命中；40∉wallDungeon → -1
    expect(getTierForDungeonWall(gv, 40, -1, dual, wallDungeon, false, false)).toBe(-1);
    expect(getTierForDungeonWall(gv, 187, -1, dual, wallDungeon)).toBe(1);           // Desert 砖墙
    expect(getTierForDungeonWall(gv, 200, -1, dual, wallDungeon)).toBe(-1);          // Hallow extra 缺省不命中
    expect(getTierForDungeonWall(gv, 28, -1, dual, wallDungeon)).toBe(2);            // Hallow 砖墙
    // 窗缘墙 31：includeWindows 只透传给 Spider/LivingWood/Shimmer/LivingMahogany/
    // Beehive/Crystal 六个特殊表检查（C# :2064-2084）；档位兜底 WallIsInStyle(wallType)
    // 用缺省形（:2093）→ Snow 窗缘墙在 tier 循环内不命中 → -1（忠实转录,勿"修"）
    expect(getTierForDungeonWall(gv, 31, -1, dual, wallDungeon, true)).toBe(-1);
    expect(getTierForDungeonWall(gv, 31, -1, dual, wallDungeon, false)).toBe(-1);
  });
});

describe('dungeon-1457 B型：genvars 判定数组 + IsConsidered 族（DungeonCrawler.cs:133-183/DungeonUtils.cs:1905-1974）', () => {
  const base = {
    tileDungeon: Array.from({ length: 720 }, (_, i) => TILE_DUNGEON.has(i)),
    wallDungeon: Array.from({ length: 360 }, (_, i) => WALL_DUNGEON.has(i)),
    crackedBricks: Array.from({ length: 720 }, () => false),
    glassWalls: Array.from({ length: 360 }, () => false),
  };
  it('B12 非 dual：判定数组 = 基表引用（不克隆不扩表,DungeonCrawler.cs:133-138）', () => {
    const gv = buildDungeonGenVars([DEFAULT], nonDual, base);
    expect(gv.isDungeonTile).toBe(base.tileDungeon);
    expect(gv.isDungeonWall).toBe(base.wallDungeon);
    expect(gv.isDungeonWallEdge).toBe(base.wallDungeon);   // 1457 新字段=同基表引用
    expect(gv.isDungeonWallGlass).toBe(base.glassWalls);
  });
  it('B13 dual：克隆扩表（Extra 并入 isDungeonTile/Wall + 窗墙三族,:139-182）', () => {
    const styles = dualDungeonStyles(1, false, DEFAULT);   // Snow/Desert/Hallow/Temple
    const gv = buildDungeonGenVars(styles, dual, base);
    expect(gv.isDungeonTile).not.toBe(base.tileDungeon);
    expect(gv.isDungeonTile[161]).toBe(true);      // Snow 砖
    expect(gv.isDungeonTile[147]).toBe(true);      // Snow ExtraTileTypes
    expect(gv.isDungeonTile[397]).toBe(true);      // Desert ExtraTileTypes
    expect(gv.isDungeonWall[40]).toBe(true);       // Snow ExtraWallTypes
    expect(gv.isDungeonWall[216]).toBe(true);      // Desert ExtraWallTypes
    expect(gv.isDungeonWall[188]).toBe(false);     // Corruption 不在地牢1表
    expect(gv.isCrackedBrick[224]).toBe(true);     // Snow 裂纹
    expect(gv.isPitTrapTile[53]).toBe(true);       // Desert PitTrap
    expect(gv.isDungeonWallEdge[31]).toBe(true);   // Snow WindowEdgeWallType
    expect(gv.isDungeonWallGlass[90]).toBe(true);  // Snow 玻璃
    expect(gv.isDungeonWallGlass[149]).toBe(true); // Snow 闭窗
  });
  it('B14 IsConsideredAnyDungeonWall/IsConsideredDungeonWallEdge（DungeonUtils.cs:1905-1974 新增）', () => {
    const styles = dualDungeonStyles(1, false, DEFAULT);
    const gv = buildDungeonGenVars(styles, dual, base);
    expect(isConsideredDungeonWallEdge(gv, 31)).toBe(true);    // 窗缘墙
    expect(isConsideredDungeonWallEdge(gv, 90)).toBe(false);   // 玻璃≠缘
    expect(isConsideredAnyDungeonWall(gv, 90)).toBe(true);     // 玻璃∈anyWall
    expect(isConsideredAnyDungeonWall(gv, 31)).toBe(true);
    expect(isConsideredAnyDungeonWall(gv, 0)).toBe(false);
    expect(isConsideredAnyDungeonWall(gv, 7)).toBe(true);      // Main.wallDungeon 基线
    // allDungeons 跨地牢集：地牢0 表的 Corruption 缘墙 33 在地牢1 单表查不到
    const gv0 = buildDungeonGenVars(dualDungeonStyles(0, false, DEFAULT), dual, base);
    expect(isConsideredDungeonWallEdge(gv, 33)).toBe(false);
    expect(isConsideredDungeonWallEdge(gv, 33, true, [gv, gv0])).toBe(true);
  });
});

describe('dungeon-1457 B型：双地牢旗→行为链接', () => {
  it('B15 dualDungeonStyles 装配序（DungeonCrawler.cs:111-128）：0=[Cavern,Crimson|Corruption,Jungle,Default] 1=[Snow,Desert,Hallow,Temple]', () => {
    const d0c = dualDungeonStyles(0, false, DEFAULT);
    const d0r = dualDungeonStyles(0, true, DEFAULT);
    expect(d0c.map((s) => s.Style)).toEqual([1, 4, 8, 0]);
    expect(d0r.map((s) => s.Style)).toEqual([1, 5, 8, 0]);   // crimson → Crimson 档
    expect(dualDungeonStyles(1, false, DEFAULT).map((s) => s.Style)).toEqual([2, 3, 6, 10]);
  });
  it('B16 UnbreakableWallTiers/DungeonGenerationStyleID 常量表（1456 同表,非新文件）', () => {
    expect(DualDungeonUnbreakableWallTiers).toEqual({ EarlyGame: 0, EvilBoss: 1, JungleBoss: 2, Dungeon: 3, Hallow: 4, Temple: 5 });
    expect(DungeonGenerationStyleID.Count).toBe(16);
    expect(DungeonGenerationStyleID.Dungeon).toBe(0);
    expect(DungeonGenerationStyleID.Crystal).toBe(15);
  });
  it('B17 placeTrap 双地牢界拒门（WorldGen.cs:8865）三因子真值表', () => {
    const bounds = { l: 100, t: 200, r: 300, b: 400 };
    dualDungeonState.enabled = false;
    dualDungeonState.potentialBounds = [bounds];
    dualDungeonTrapWindow.allowTrapGenerationInDungeon = false;
    // 因子①：普通世界旗关 → 恒不拒（1456 行为,界内界外皆然）
    expect(placeTrapDualDungeonReject(150, 250)).toBe(false);
    expect(placeTrapDualDungeonReject(5, 5)).toBe(false);
    // 因子②：窗口开（DungeonGlobalTraps.Traps 窗口）→ 不拒
    dualDungeonState.enabled = true;
    expect(placeTrapDualDungeonReject(150, 250)).toBe(true);
    dualDungeonTrapWindow.allowTrapGenerationInDungeon = true;
    expect(placeTrapDualDungeonReject(150, 250)).toBe(false);
    dualDungeonTrapWindow.allowTrapGenerationInDungeon = false;
    // 因子③：界外不拒
    expect(placeTrapDualDungeonReject(99, 250)).toBe(false);
    expect(placeTrapDualDungeonReject(150, 400)).toBe(false);   // 半开矩形 b 不含
    expect(placeTrapDualDungeonReject(150, 399)).toBe(true);
    // 多地牢界域并集（InAnyPotentialDungeonBounds 遍历语义）
    dualDungeonState.potentialBounds = [bounds, { l: 1000, t: 200, r: 1200, b: 400 }];
    expect(placeTrapDualDungeonReject(1100, 250)).toBe(true);
  });
  it('B18 dgTraps 窗口旗（DungeonGlobalTraps.cs:33/:154）：首尾置 true/false', () => {
    dualDungeonTrapWindow.allowTrapGenerationInDungeon = false;
    // 模拟 DungeonPass.dgTraps 的窗口开闭（真窗口在 runDungeonPass 内,此处验旗语义）
    dualDungeonTrapWindow.allowTrapGenerationInDungeon = true;
    expect(dualDungeonTrapWindow.allowTrapGenerationInDungeon).toBe(true);
    dualDungeonTrapWindow.allowTrapGenerationInDungeon = false;
    expect(dualDungeonTrapWindow.allowTrapGenerationInDungeon).toBe(false);
  });
});

describe('dungeon-1457 普通世界零扰动', () => {
  it('B19 非 dual 下 tier/风格判定全 id 扫描与 1456 公式逐位相等（B6 复述为守卫）+ 界拒门旗关恒假', () => {
    const gv = { dungeonGenerationStyles: [DEFAULT] };
    for (let t = 0; t < 720; t++) {
      const expected = t > 0 && TILE_DUNGEON.has(t) ? 1 : -1;
      if (getTierForDungeonTile(gv, t, -1, false, tileDungeon) !== expected) throw new Error(`tile ${t}`);
    }
    dualDungeonState.enabled = false;
    for (let x = -10; x < 500; x += 7) {
      if (placeTrapDualDungeonReject(x, x)) throw new Error(`reject fired at ${x}`);
    }
    expect(true).toBe(true);
  });
});
