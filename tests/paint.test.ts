// 油漆（Paint）系统回归——1.4.5.6 反编译源码 1:1 行为锁。
// 覆盖：paintColor/MapColor 色表、paintTile/paintWall 原语守卫、TileStore 存储与
// KillTile/PlaceTile 清漆语义、存档往返（新字段 + 旧档缺省）、Item.paint/paintTool 表、
// FindPaintOrCoating 弹药栏优先、SmartCursor 三策略目标集、史莱姆踩漆 lerp。
// 权威行号（仓库外 Terarria1456/ 树）见各断言注释。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { SmartCursor, type SmartCursorEnv } from '../src/player/SmartCursor';
import {
  paintColor, coatingColor, applyPaintTint, applyPaintTintSpecial,
  convertPaintIdToTileShaderIndex, type LeafPaintSettings,
  SPECIAL_PAINT_SETTINGS, WALL_PAINT_SETTINGS, getTilePaintSettings, getTreeFoliageSettings,
  mapPaintColor, PAINT_RGB,
  paintDustColor, paintTile, paintWall,
} from '../src/world/Paint';
import { treeGroundVariant, treeTrunkPaintStyle, palmTreePaintStyle } from '../src/render/ChunkCache';
import type { GameHooks } from '../src/entities/types';

const TILE = 16;
const DIRT = TILE_BY_KEY['dirt']!;
const STONE = TILE_BY_KEY['stone']!;

// ---- SmartCursor 测试工具（与 tests/smart-cursor.test.ts 同构的最小 env） ----
const scRun = (
  st: TileStore, mouse: { x: number; y: number },
  held: { def: (typeof ITEM_DEFS)[number] | null; tool: null },
  over: Partial<SmartCursorEnv> = {},
  sc = new SmartCursor(),
): { x: number; y: number } | null => {
  sc.wanted = true;
  sc.lookup({
    st,
    mouse,
    actor: { x: 100 * 16, y: 95 * 16, w: 20, h: 42, cx: 100 * 16 + 10, cy: 95 * 16 + 21, facing: 1 },
    held,
    settings: { toggleMode: true, smartAxeAfterPickaxe: false, holdCanReleaseMidUse: false } as SmartCursorEnv['settings'],
    tileBoost: 0,
    wireToolMode: 0,
    occupants: [],
    controlUseItem: true,
    ...over,
  });
  return sc.showing ? { x: sc.x, y: sc.y } : null;
};

const mouseAt = (tx: number, ty: number) => ({ x: tx * 16 + 8, y: ty * 16 + 8 });
const itemOf = (vid: number) => ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]]];

function hooks(w: World, p: Player): GameHooks {
  return {
    world: w, player: p,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}

describe('paintColor 色表（WorldGen.cs:43948-44061）', () => {
  it('浅层 1-12 RGB 逐条（:43951-44022）', () => {
    expect(paintColor(1)).toEqual([255, 0, 0, 255]);        // Red
    expect(paintColor(2)).toEqual([255, 127, 0, 255]);      // Orange
    expect(paintColor(3)).toEqual([255, 255, 0, 255]);      // Yellow
    expect(paintColor(5)).toEqual([0, 255, 0, 255]);        // Green
    expect(paintColor(9)).toEqual([0, 0, 255, 255]);        // Blue
    expect(paintColor(12)).toEqual([255, 0, 127, 255]);     // Pink
  });

  it('深层 13-24 与浅层同 RGB（同表成对分支 :43951-44022）', () => {
    for (let i = 1; i <= 12; i++) {
      expect(paintColor(i + 12)).toEqual(paintColor(i));
    }
    expect(paintColor(21)).toEqual([0, 0, 255, 255]);       // DeepBlue
  });

  it('特殊五色 + 负相 alpha（:44023-44059）', () => {
    expect(paintColor(25)).toEqual([75, 75, 75, 255]);     // BlackPaint = 深灰 75
    expect(paintColor(26)).toEqual([255, 255, 255, 255]);  // White
    expect(paintColor(27)).toEqual([175, 175, 175, 255]);  // Gray
    expect(paintColor(28)).toEqual([255, 178, 125, 255]);  // Brown
    expect(paintColor(29)).toEqual([25, 25, 25, 255]);     // Shadow
    expect(paintColor(30)).toEqual([200, 200, 200, 150]);  // Negative（半透明）
  });

  it('0 与废弃 31 → Color.White（C# 初值未命中分支 :43950/:44060）', () => {
    expect(paintColor(0)).toEqual([255, 255, 255, 255]);
    expect(paintColor(31)).toEqual([255, 255, 255, 255]);
  });

  it('PAINT_RGB 预展开与 paintColor 一致（0-31 全量）', () => {
    for (let i = 0; i <= 31; i++) {
      const c = paintColor(i);
      expect([...PAINT_RGB[i]]).toEqual([c[0], c[1], c[2]]);
    }
  });

  it('coatingColor（WorldGen.cs:44063-44071）：1 荧光 2 隐形 其余透明', () => {
    expect(coatingColor(1)).toEqual([235, 170, 255, 255]);
    expect(coatingColor(2)).toEqual([180, 245, 255, 255]);
    expect(coatingColor(0)).toEqual([0, 0, 0, 0]);
  });
});

describe('applyPaintTint：TileShader.cso SM2 字节码真值（fxTile.txt 行号锚）', () => {
  it('Pass1 恒等：paint 0 / 废弃 31 / 越界安全缺省（:13-22）', () => {
    expect([...applyPaintTint(151, 107, 75, 0)]).toEqual([151, 107, 75]);
    expect([...applyPaintTint(151, 107, 75, 31)]).toEqual([151, 107, 75]);  // 31 → pass 0（Main.cs:58068）
    expect([...applyPaintTint(151, 107, 75, 32)]).toEqual([151, 107, 75]);  // 5bit 域外
  });

  it('浅层 1-12：hi/lo/midS 排序槽调制（非乘色！Pass2-13）', () => {
    // 泥土色 (151,107,75)：hi=151 lo=75 midS=min(max(151,107),75)=75（b 严格最小 → midS=lo）
    expect([...applyPaintTint(151, 107, 75, 1)]).toEqual([151, 75, 75]);    // Pass2 :23-40 红=(hi,lo,lo)
    expect([...applyPaintTint(151, 107, 75, 2)]).toEqual([151, 113, 75]);   // Pass3 :41-63 橙 g=(hi+lo)/2=113
    expect([...applyPaintTint(151, 107, 75, 5)]).toEqual([75, 151, 75]);    // Pass6 :105-122 绿=(lo,hi,lo)
    // ★ midS 异常槽：第二满档通道取 min(max(r,g),b) 而非 hi——(100,150,200) 的 midS=150
    expect([...applyPaintTint(100, 150, 200, 3)]).toEqual([200, 150, 100]); // Pass4 :64-81 黄 g=midS≠hi
    expect([...applyPaintTint(100, 150, 200, 7)]).toEqual([100, 200, 150]); // Pass8 :146-163 青 b=midS
    expect([...applyPaintTint(100, 150, 200, 11)]).toEqual([200, 100, 150]);// Pass12 :228-245 紫罗兰 b=midS
  });

  it('深层 13-24：低槽 ×0.4f（Pass14-25，def c0,0.400000）', () => {
    expect([...applyPaintTint(151, 107, 75, 13)]).toEqual([151, 30, 30]);   // Pass14 :269-287 (hi,.4lo,.4lo)
    expect([...applyPaintTint(150, 107, 100, 14)]).toEqual([150, 95, 40]);  // Pass15 :288-310 g=(hi+.4lo)/2
    expect([...applyPaintTint(100, 150, 200, 19)]).toEqual([40, 200, 150]); // Pass20 :401-422 深青 b=midS
    // 深层 ≠ 浅层（同 RGB 不同 pass 强度）：13 与 1 低槽分叉 75 → 30
    expect([...applyPaintTint(151, 107, 75, 1)]).toEqual([151, 75, 75]);
    expect([...applyPaintTint(151, 107, 75, 13)]).toEqual([151, 30, 30]);
  });

  it('黑/白/灰/棕/暗影五档（Pass26/27/28/41/42）', () => {
    expect([...applyPaintTint(151, 107, 75, 25)]).toEqual([34, 34, 34]);    // Pass26 :536-555 0.15(hi+lo)=0.15×226
    expect([...applyPaintTint(151, 107, 75, 26)]).toEqual([200, 200, 200]); // Pass27 :556-580 (7hi+3lo)·0.1×(2-.5(hi+lo))
    expect([...applyPaintTint(151, 107, 75, 27)]).toEqual([113, 113, 113]); // Pass28 :581-600 0.5(hi+lo)=113
    expect([...applyPaintTint(151, 107, 75, 28)]).toEqual([151, 106, 74]);  // Pass41 :1321-1338 (hi,.7hi,.49hi)
    expect([...applyPaintTint(151, 107, 75, 29)]).toEqual([6, 6, 6]);       // Pass42 :1339-1358 0.025×226=5.65
    // 白漆非恒等：中灰提亮 0.50196→0.75196（≈×1.5；旧乘色模型恒等）
    expect([...applyPaintTint(128, 128, 128, 26)]).toEqual([192, 192, 192]);
  });

  it('负相 30 瓦片档：反转 + 纯黑守卫（Pass43 :1359-1377）', () => {
    expect([...applyPaintTint(100, 150, 200, 30)]).toEqual([155, 105, 55]);
    expect([...applyPaintTint(0, 0, 0, 30)]).toEqual([0, 0, 0]);  // ★hi==0 门：黑像素不反白（旧模型=255）
  });

  it('负相 30 墙档：max(1.5−2c,0) 陡化反转（Pass44 :1378-1402，GetWallSettings 恒墙 hack）', () => {
    expect([...applyPaintTint(10, 20, 30, 30, true)]).toEqual([171, 151, 131]);
    expect([...applyPaintTint(100, 150, 200, 30, true)]).toEqual([0, 0, 0]); // 亮像素压 0
    expect([...applyPaintTint(0, 0, 0, 30, true)]).toEqual([0, 0, 0]);
  });

  it('convertPaintIdToTileShaderIndex：paint→pass 序号表（Main.cs:58064-58083）', () => {
    expect(convertPaintIdToTileShaderIndex(0, false, false)).toBe(0);
    expect(convertPaintIdToTileShaderIndex(31, false, false)).toBe(0);   // 废弃荧光归 pass 0
    expect(convertPaintIdToTileShaderIndex(1, false, false)).toBe(1);    // 浅层直映
    expect(convertPaintIdToTileShaderIndex(24, false, false)).toBe(24);  // 深层直映
    expect(convertPaintIdToTileShaderIndex(27, false, false)).toBe(27);  // 灰 27
    expect(convertPaintIdToTileShaderIndex(28, false, false)).toBe(40);  // 棕 +12
    expect(convertPaintIdToTileShaderIndex(29, false, false)).toBe(41);  // 暗影 +12
    expect(convertPaintIdToTileShaderIndex(30, false, false)).toBe(42);  // 负相瓦片档
    expect(convertPaintIdToTileShaderIndex(30, false, true)).toBe(43);   // 负相墙档
    expect(convertPaintIdToTileShaderIndex(5, true, false)).toBe(32);    // 特判组 5+27
    expect(convertPaintIdToTileShaderIndex(12, true, false)).toBe(39);   // 特判组上界
    expect(convertPaintIdToTileShaderIndex(13, true, false)).toBe(13);   // 深层不吃特判组
  });

  it('叶色相特判组门（Pass29-40 :601-1320）：hue/sat 窗 + invert（DefaultDirt 锚）', () => {
    const dirt: LeafPaintSettings = {  // TreePaintSystemData.cs:16-24 DefaultDirt（泥面/默认树冠）
      hueTestOffset: 0, minHue: 0.03, maxHue: 0.08, minSat: 0.38, maxSat: 0.53, invert: true,
    };
    // 草绿 (106,190,48)：hue=0.2652 出窗 → match=false → invert → 上漆（红=(hi,lo,lo)）
    expect([...applyPaintTintSpecial(106, 190, 48, 1, dirt)]).toEqual([190, 48, 48]);
    // 棕橙 (200,137,110)：hue=0.0500/sat=0.4500 入窗 → match=true → invert → 保原色
    expect([...applyPaintTintSpecial(200, 137, 110, 1, dirt)]).toEqual([200, 137, 110]);
    // 特判支仅 1-12 可达（Main.cs:58080-58083），深层 13 落回普通 pass
    expect([...applyPaintTintSpecial(106, 190, 48, 13, dirt)]).toEqual([...applyPaintTint(106, 190, 48, 13)]);
    // 灰度像素（Δ=0）hue/sat 归零（:625/:632 守卫）：hue 0 不入 [0.03,0.08] → invert → 上漆
    expect([...applyPaintTintSpecial(128, 128, 128, 1, dirt)]).toEqual([...applyPaintTint(128, 128, 128, 1)]);
  });
});

describe('特判组 per-type 设置表（TreePaintSystemData.cs 1:1）', () => {
  const fr = Math.fround; // 表常量在 f32 域（C# f 后缀 → shader 常量同域）

  it('特判组具名设置 24 项逐字段（:16-245；另 DefaultNoSpecialGroups/ForWalls 两非特判档）', () => {
    const S = SPECIAL_PAINT_SETTINGS;
    const all = (invert: boolean, off: number, h0: number, h1: number, s0: number, s1: number) => ({
      useSpecialGroups: true, useWallShaderHacks: false,
      hueTestOffset: fr(off), minHue: fr(h0), maxHue: fr(h1), minSat: fr(s0), maxSat: fr(s1), invert,
    });
    expect({ ...S.DefaultDirt }).toEqual(all(true, 0, 0.03, 0.08, 0.38, 0.53));            // :16-24
    expect({ ...S.CullMud }).toEqual(all(true, 0.5, 0.42, 0.55, 0.2, 0.27));               // :26-35
    expect({ ...S.WoodPurity }).toEqual(all(false, 0, 1 / 6, 5 / 6, 0, 1));                // :37-44
    expect({ ...S.WoodCorruption }).toEqual(all(false, 0, 0.5, 1, 0.27, 1));               // :46-53
    expect({ ...S.WoodJungle }).toEqual(all(false, 0, 1 / 6, 5 / 6, 0, 1));                // :55-62
    expect({ ...S.WoodHallow }).toEqual(all(true, 0, 0, 1, 0, 0.34));                      // :64-72
    expect({ ...S.WoodSnow }).toEqual(all(false, 0, 0, 5 / 72, 0, 1));                     // :74-81
    expect({ ...S.WoodCrimson }).toEqual(all(true, 0, 1 / 3, 2 / 3, 0, 1));                // :83-91
    expect({ ...S.WoodJungleUnderground }).toEqual(all(false, 0, 1 / 6, 5 / 6, 0, 1));     // :93-100
    expect({ ...S.WoodGlowingMushroom }).toEqual(all(false, 0, 0.5, 5 / 6, 0, 1));         // :102-109
    expect({ ...S.VanityCherry }).toEqual(all(false, 0, 5 / 6, 1, 0, 1));                  // :111-118
    expect({ ...S.VanityYellowWillow }).toEqual(all(true, 0, 0, 0.025, 0, 1));             // :120-128
    expect({ ...S.TreeAsh }).toEqual(all(true, 0, 0, 0.025, 0, 1));                        // :130-138
    const gem = { ...S.GemTreeRuby };                                                      // 七宝石树同值 :140-208
    expect(gem).toEqual(all(true, 0, 0, 1, 0, 0.0027777778));
    for (const k of ['GemTreeAmber', 'GemTreeSapphire', 'GemTreeEmerald', 'GemTreeAmethyst', 'GemTreeTopaz', 'GemTreeDiamond'] as const) {
      expect({ ...S[k] }).toEqual(gem);
    }
    expect({ ...S.PalmTreePurity }).toEqual(all(false, 0, 11 / 72, 0.25, 0.88, 1));        // :210-217
    expect({ ...S.PalmTreeCorruption }).toEqual(all(false, 0, 0, 1, 0.4, 1));              // :219-226
    expect({ ...S.PalmTreeCrimson }).toEqual(all(false, 0.5, 1 / 3, 19 / 36, 0, 1));       // :228-236
    expect({ ...S.PalmTreeHallow }).toEqual(all(false, 0, 0.5, 11 / 18, 0, 1));            // :238-245
    expect(Object.keys(S)).toHaveLength(24);   // 24 特判组 + 2 非特判 default = TreePaintSystemData 全 26
  });

  it('getTilePaintSettings：23 表型逐条 + 表外 null（:252-324）', () => {
    const S = SPECIAL_PAINT_SETTINGS;
    for (const t of [0, 2, 23, 109, 199, 477, 492, 633]) {          // 泥面八型 :258-266
      expect(getTilePaintSettings(t)).toBe(S.DefaultDirt);
    }
    for (const t of [59, 60, 70]) expect(getTilePaintSettings(t)).toBe(S.CullMud); // :267-269
    // 树干 5 按 style（GetTreeBiome 变体）：:272-282
    expect(getTilePaintSettings(5, 0)).toBe(S.WoodCorruption);
    expect(getTilePaintSettings(5, 1)).toBe(S.WoodJungle);
    expect(getTilePaintSettings(5, 2)).toBe(S.WoodHallow);
    expect(getTilePaintSettings(5, 3)).toBe(S.WoodSnow);
    expect(getTilePaintSettings(5, 4)).toBe(S.WoodCrimson);
    expect(getTilePaintSettings(5, 5)).toBe(S.WoodJungleUnderground);
    expect(getTilePaintSettings(5, 6)).toBe(S.WoodGlowingMushroom);
    expect(getTilePaintSettings(5, -1)).toBe(S.WoodPurity);         // default（含 -1 未知地面）
    expect(getTilePaintSettings(5)).toBe(S.WoodCorruption);         // tileStyle 缺省 0（渲染侧恒显式传 style）
    // 棕榈 323 按 style（GetPalmTreeVariant 沙型+绿洲）：:283-300
    expect(getTilePaintSettings(323, 0)).toBe(S.PalmTreePurity);
    expect(getTilePaintSettings(323, 4)).toBe(S.PalmTreePurity);
    expect(getTilePaintSettings(323, 1)).toBe(S.PalmTreeCrimson);
    expect(getTilePaintSettings(323, 5)).toBe(S.PalmTreeCrimson);
    expect(getTilePaintSettings(323, 2)).toBe(S.PalmTreeHallow);
    expect(getTilePaintSettings(323, 6)).toBe(S.PalmTreeHallow);
    expect(getTilePaintSettings(323, 3)).toBe(S.PalmTreeCorruption);
    expect(getTilePaintSettings(323, 7)).toBe(S.PalmTreeCorruption);
    expect(getTilePaintSettings(323, -1)).toBe(S.WoodPurity);       // default（含 -1）
    // 宝石树七型 :301-314
    expect(getTilePaintSettings(583)).toBe(S.GemTreeTopaz);
    expect(getTilePaintSettings(584)).toBe(S.GemTreeAmethyst);
    expect(getTilePaintSettings(585)).toBe(S.GemTreeSapphire);
    expect(getTilePaintSettings(586)).toBe(S.GemTreeEmerald);
    expect(getTilePaintSettings(587)).toBe(S.GemTreeRuby);
    expect(getTilePaintSettings(588)).toBe(S.GemTreeDiamond);
    expect(getTilePaintSettings(589)).toBe(S.GemTreeAmber);
    // 装饰树 595/596 樱、615/616 柳 :315-320；灰烬树 634 :321-322
    expect(getTilePaintSettings(595)).toBe(S.VanityCherry);
    expect(getTilePaintSettings(596)).toBe(S.VanityCherry);
    expect(getTilePaintSettings(615)).toBe(S.VanityYellowWillow);
    expect(getTilePaintSettings(616)).toBe(S.VanityYellowWillow);
    expect(getTilePaintSettings(634)).toBe(S.TreeAsh);
    // 表外 → null（default :256-257 DefaultNoSpecialGroups → 普通组）
    // 147 雪/661 腐化丛林草/662 猩红丛林草只在 GetTreeVariant 里当地面,不在本表
    for (const t of [1, 3, 4, 30, 53, 72, 147, 661, 662, 1000]) {
      expect(getTilePaintSettings(t)).toBeNull();
    }
  });

  it('getTreeFoliageSettings：default=DefaultDirt 非普通组 + 关键档位（:326-397）', () => {
    const S = SPECIAL_PAINT_SETTINGS;
    expect(getTreeFoliageSettings(999, 0)).toBe(S.DefaultDirt);      // :330-331 ★default 非 NoSpecial
    for (const f of [0, 6, 7, 8, 9, 10]) expect(getTreeFoliageSettings(f, 0)).toBe(S.WoodPurity); // :332-338
    expect(getTreeFoliageSettings(1, 0)).toBe(S.WoodCorruption);     // :362-363
    for (const f of [2, 11, 13]) expect(getTreeFoliageSettings(f, 0)).toBe(S.WoodJungle);         // :358-361
    for (const f of [3, 19, 20]) expect(getTreeFoliageSettings(f, 0)).toBe(S.WoodHallow);         // :364-367
    for (const f of [4, 12, 16, 17, 18]) expect(getTreeFoliageSettings(f, 0)).toBe(S.WoodSnow);   // :368-373
    expect(getTreeFoliageSettings(5, 0)).toBe(S.WoodCrimson);        // :374-375
    expect(getTreeFoliageSettings(14, 0)).toBe(S.WoodGlowingMushroom); // :376-377
    // 棕榈双档 15/21 按 style :339-357
    expect(getTreeFoliageSettings(15, 0)).toBe(S.PalmTreePurity);
    expect(getTreeFoliageSettings(15, 1)).toBe(S.PalmTreeCrimson);
    expect(getTreeFoliageSettings(15, 2)).toBe(S.PalmTreeHallow);
    expect(getTreeFoliageSettings(15, 3)).toBe(S.PalmTreeCorruption);
    expect(getTreeFoliageSettings(21, 4)).toBe(S.PalmTreePurity);
    expect(getTreeFoliageSettings(15, 9)).toBe(S.WoodPurity);        // :345-346 default
    // 宝石树 22-28 :378-391；装饰树 29 樱 30 柳 :392-395
    expect(getTreeFoliageSettings(22, 0)).toBe(S.GemTreeTopaz);
    expect(getTreeFoliageSettings(23, 0)).toBe(S.GemTreeAmethyst);
    expect(getTreeFoliageSettings(24, 0)).toBe(S.GemTreeSapphire);
    expect(getTreeFoliageSettings(25, 0)).toBe(S.GemTreeEmerald);
    expect(getTreeFoliageSettings(26, 0)).toBe(S.GemTreeRuby);
    expect(getTreeFoliageSettings(27, 0)).toBe(S.GemTreeDiamond);
    expect(getTreeFoliageSettings(28, 0)).toBe(S.GemTreeAmber);
    expect(getTreeFoliageSettings(29, 0)).toBe(S.VanityCherry);
    expect(getTreeFoliageSettings(30, 0)).toBe(S.VanityYellowWillow);
  });

  it('渲染侧分发判据：特判 pass ⟺ paint∈[1,12] ∧ 类型在表【都】成立（Main.cs:58064-58083）', () => {
    // 表内 ∧ 1-12 → 28-39 特判组
    expect(convertPaintIdToTileShaderIndex(1, true, false)).toBe(28);
    expect(convertPaintIdToTileShaderIndex(12, true, false)).toBe(39);
    // 表内 ∧ 深层 13-24 → 普通深层（:58080 的 [1,12] 窗不含 13-24）
    expect(convertPaintIdToTileShaderIndex(13, true, false)).toBe(13);
    expect(convertPaintIdToTileShaderIndex(24, true, false)).toBe(24);
    // 表内 ∧ 25-30 → :58076-58079 先行拦截 +12（特判组不吃特殊五色）
    expect(convertPaintIdToTileShaderIndex(27, true, false)).toBe(27);
    expect(convertPaintIdToTileShaderIndex(28, true, false)).toBe(40);
    expect(convertPaintIdToTileShaderIndex(30, true, false)).toBe(42);
    // 表外 → 恒普通（哪怕 1-12）
    expect(convertPaintIdToTileShaderIndex(5, false, false)).toBe(5);
    // 墙（GetWallSettings :399-402 恒 ForWalls）：无特判组 + paint30 墙档 Pass44
    expect(convertPaintIdToTileShaderIndex(1, false, true)).toBe(1);
    expect(convertPaintIdToTileShaderIndex(12, false, true)).toBe(12);
    expect(convertPaintIdToTileShaderIndex(30, false, true)).toBe(43);
    expect(WALL_PAINT_SETTINGS).toEqual({
      useSpecialGroups: false, useWallShaderHacks: true,
      hueTestOffset: 0, minHue: 0, maxHue: 0, minSat: 0, maxSat: 0, invert: false,
    });
  });
});

describe('ChunkCache 特判组 style 派生（TileDrawing.cs:1749-1829 1:1）', () => {
  it('treeGroundVariant：八地面型 + 丛林地表/地下分裂 + 未激活/表外 -1（:1801-1829）', () => {
    const st = new TileStore(8, 8);
    const g = (key: string, x: number, y: number) => st.setTileSilent(x, y, TILE_BY_KEY[key]);
    const v = (x: number, y: number, surface: number) => treeGroundVariant(st, x, y, surface);
    g('v_23_corrupt_grass_block', 1, 1);  expect(v(1, 1, 10)).toBe(0);   // :1809-1811
    g('v_661_corrupt_jungle_grass_block', 2, 1); expect(v(2, 1, 10)).toBe(0);
    g('v_60_jungle_grass_block', 3, 2);   expect(v(3, 2, 10)).toBe(1);   // :1812-1815 y<=surface 地表
    expect(v(3, 2, 1)).toBe(5);                                          // :1816-1817 y>surface 地下
    g('v_70_mushroom_grass_block', 4, 1); expect(v(4, 1, 10)).toBe(6);   // :1818-1819
    g('v_109_hallowed_grass_block', 5, 1); expect(v(5, 1, 10)).toBe(2);  // :1820-1822
    g('v_492_hallowed_mowed_grass_block', 6, 1); expect(v(6, 1, 10)).toBe(2);
    g('snow', 7, 1);                      expect(v(7, 1, 10)).toBe(3);   // :1823-1824
    const st2 = new TileStore(8, 8);
    st2.setTileSilent(1, 1, TILE_BY_KEY['v_199_crimson_grass_block']);
    expect(treeGroundVariant(st2, 1, 1, 10)).toBe(4);                   // :1825-1827
    st2.setTileSilent(2, 1, TILE_BY_KEY['v_662_crimson_jungle_grass_block']);
    expect(treeGroundVariant(st2, 2, 1, 10)).toBe(4);
    st2.setTileSilent(3, 1, TILE_BY_KEY['dirt']);                       // 表外地面 → -1
    expect(treeGroundVariant(st2, 3, 1, 10)).toBe(-1);                  // :1828-1829
    expect(treeGroundVariant(st2, 4, 1, 10)).toBe(-1);                  // 未激活 → -1（:1803-1805）
    expect(treeGroundVariant(st2, 99, 1, 10)).toBe(-1);                 // 越界 → -1
  });

  it('treeTrunkPaintStyle：列修正 + 向下扫树底（:1758-1798）', () => {
    const TREE = TILE_BY_KEY['tree']!;   // vanilla sheet 5
    const st = new TileStore(8, 8);
    // 树干列 (2,2)-(2,4) + 底下腐化草 (2,5)：style 0 → WoodCorruption 档
    for (let y = 2; y <= 4; y++) st.setTileSilent(2, y, TREE);
    st.setTileSilent(2, 5, TILE_BY_KEY['v_23_corrupt_grass_block']);
    expect(treeTrunkPaintStyle(st, 2, 2, 0, 0, 10)).toBe(0);
    // 丛林草在地下（surface=1，树底 y=5>1）→ 5 → WoodJungleUnderground 档
    st.setTileSilent(2, 5, TILE_BY_KEY['v_60_jungle_grass_block']);
    expect(treeTrunkPaintStyle(st, 2, 3, 0, 0, 1)).toBe(5);
    // frameX=66 && frameY<=45 → 列 +1（:1763-1765）：真树干在 (3,2)-(3,4)
    for (let y = 2; y <= 4; y++) st.setTileSilent(3, y, TREE);
    st.setTileSilent(3, 5, TILE_BY_KEY['snow']);
    expect(treeTrunkPaintStyle(st, 2, 2, 66, 0, 10)).toBe(3);
    // frameY>=198 分支（:1771-1780）：fx=66 → 列 −1
    for (let y = 2; y <= 4; y++) st.setTileSilent(1, y, TREE);
    st.setTileSilent(1, 5, TILE_BY_KEY['v_199_crimson_grass_block']);
    expect(treeTrunkPaintStyle(st, 2, 2, 66, 198, 10)).toBe(4);
    // 树底无草（泥土）→ -1 → default 档 WoodPurity
    st.setTileSilent(3, 5, TILE_BY_KEY['dirt']);
    expect(treeTrunkPaintStyle(st, 2, 2, 66, 0, 10)).toBe(-1);
  });

  it('palmTreePaintStyle：沙型四档 + 绿洲 +4（含 -1 也 +4 的原版行为）（:1749-1756/:3519-3543）', () => {
    const PALM = TILE_BY_KEY['v_323_palm_trees']!;
    const st = new TileStore(24, 8);     // w=24 < 380×2 → 无绿洲列
    const sand = (key: string, x: number) => {
      for (let y = 2; y <= 3; y++) st.setTileSilent(x, y, PALM);
      st.setTileSilent(x, 4, TILE_BY_KEY[key]);
      return palmTreePaintStyle(st, x, 2, st.w);
    };
    expect(sand('sand', 1)).toBe(0);                          // :3522-3524
    expect(sand('v_234_crimsand_block', 2)).toBe(1);          // :3525-3527
    expect(sand('v_116_pearlsand_block', 3)).toBe(2);         // :3528-3530
    expect(sand('v_112_ebonsand_block', 4)).toBe(3);          // :3531-3533
    // 非沙地面 → -1（无 +4：非绿洲列）
    for (let y = 2; y <= 3; y++) st.setTileSilent(5, y, PALM);
    st.setTileSilent(5, 4, TILE_BY_KEY['dirt']);
    expect(palmTreePaintStyle(st, 5, 2, st.w)).toBe(-1);
    // 绿洲列（380 <= x <= w-380，IsPalmOasisTree :27352-27359）：沙 0+4 / 非 -1+4=3
    const wide = new TileStore(800, 8);
    for (let y = 2; y <= 3; y++) wide.setTileSilent(400, y, PALM);
    wide.setTileSilent(400, 4, TILE_BY_KEY['sand']);
    expect(palmTreePaintStyle(wide, 400, 2, wide.w)).toBe(4);
    wide.setTileSilent(400, 4, TILE_BY_KEY['dirt']);
    expect(palmTreePaintStyle(wide, 400, 2, wide.w)).toBe(3); // ★-1+4=3 原版 quirk 1:1
    // 海滩列不吃 +4
    for (let y = 2; y <= 3; y++) wide.setTileSilent(100, y, PALM);
    wide.setTileSilent(100, 4, TILE_BY_KEY['sand']);
    expect(palmTreePaintStyle(wide, 100, 2, wide.w)).toBe(0);
  });
});

describe('渲染换色公式', () => {

  it('mapPaintColor 默认分支按最大通道缩放（MapHelper.cs:1854-1861）', () => {
    // 泥土地图色 (151,107,75)：max=151 → 红漆 = (255,0,0)*151/255
    const out = mapPaintColor(false, [151, 107, 75], 1);
    expect([...out]).toEqual([(255 * 151 / 255) | 0, 0, 0]);
  });

  it('mapPaintColor 暗影 29 用中位通道×0.3（:1832-1839）', () => {
    // (r,g,b)=(60,120,200)：两次交换后 num3=120（中位）→ (25,25,25)*0.4706
    const out = mapPaintColor(false, [60, 120, 200], 29);
    expect([...out]).toEqual([(25 * (120 / 255) * 0.3) | 0, (25 * (120 / 255) * 0.3) | 0, (25 * (120 / 255) * 0.3) | 0]);
  });

  it('mapPaintColor 负相 30：tile 全反转 / wall 半幅反转（:1840-1853）', () => {
    expect([...mapPaintColor(false, [100, 150, 200], 30)]).toEqual([155, 105, 55]);
    expect([...mapPaintColor(true, [100, 150, 200], 30)]).toEqual([((255 - 100) * 0.5) | 0, ((255 - 150) * 0.5) | 0, ((255 - 200) * 0.5) | 0]);
  });
});

describe('paintTile/paintWall 原语（WorldGen.cs:44137-44159 / 44257-44279）', () => {
  it('paintTile：非活性 false / 同色 false / 改色 true 且写入', () => {
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    expect(paintTile(st, 1, 1, 5)).toBe(true);
    expect(st.paint[st.idx(1, 1)]).toBe(5);
    expect(paintTile(st, 1, 1, 5)).toBe(false);      // 同色（:44145-44148）
    expect(paintTile(st, 2, 2, 5)).toBe(false);      // 空气（!active :44140）
  });

  it('paintWall：无墙 false / 同色 false / 改色 true 且写入', () => {
    const st = new TileStore(4, 4);
    st.setWallSilent(1, 1, 4);
    expect(paintWall(st, 1, 1, 9)).toBe(true);
    expect(st.paintWall[st.idx(1, 1)]).toBe(9);
    expect(paintWall(st, 1, 1, 9)).toBe(false);
    expect(paintWall(st, 2, 2, 9)).toBe(false);      // wall==0（:44260）
  });

  it('尘效时序：tile 先尘后写 / wall 先写后尘（与原版调用序一致）', () => {
    const st = new TileStore(2, 2);
    st.setTileSilent(0, 0, DIRT);
    st.setWallSilent(1, 0, 4);
    const order: string[] = [];
    const tHook = (x: number, y: number, np: number, op: number) => {
      order.push(`tile-dust:${st.paint[st.idx(x, y)]}>${np},${op}`);
    };
    paintTile(st, 0, 0, 3, tHook);
    expect(order[0]).toBe('tile-dust:0>3,0');        // 尘时旧值未写
    const wHook = () => { order.push(`wall-dust:${st.paintWall[st.idx(1, 0)]}`); };
    paintWall(st, 1, 0, 3, wHook);
    expect(order[1]).toBe('wall-dust:3');            // 尘时新值已写
  });

  it('paintDustColor：新漆 0 回退旧色（WorldGen.cs:44093-44097）', () => {
    expect(paintDustColor(0, 7)).toEqual(paintColor(7));
    expect(paintDustColor(7, 0)).toEqual(paintColor(7));
  });
});

describe('TileStore 存储 + 清漆语义', () => {
  it('默认全零；setPaint/setPaintWall 写入并触发 listeners（chunk/小地图重建链）', () => {
    const st = new TileStore(4, 4);
    expect(st.paint.every((v) => v === 0)).toBe(true);
    expect(st.paintWall.every((v) => v === 0)).toBe(true);
    const hits: Array<[number, number]> = [];
    st.onTileChanged((x, y) => hits.push([x, y]));
    st.setPaint(2, 2, 12);
    st.setPaintWall(2, 2, 12);
    expect(st.paint[st.idx(2, 2)]).toBe(12);
    expect(st.paintWall[st.idx(2, 2)]).toBe(12);
    expect(hits).toEqual([[2, 2], [2, 2]]);
    st.setPaint(2, 2, 12); // 同值不重复触发（幂等）
    expect(hits.length).toBe(2);
  });

  it('KillTile 清漆（WorldGen.cs:63933-63939；1457:64398-64402 active(false)+ClearBlockPaintAndCoating）', () => {
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    st.setPaintSilent(1, 1, 5);
    st.setTile(1, 1, 0);
    expect(st.paint[st.idx(1, 1)]).toBe(0);
  });

  // ★IIIII201 重产（2026-09-04）：旧断言把 PlaceTile 的运行时头 Clear 套到
  //   setTileSilent（世界生成直写域）上。两域反编译真值：
  //   · PlaceTile 头 `if (!tile.active()) tile.Clear(Tile|TilePaint|Slope)` 在
  //     1456:59499-59501 / 1457:59964-59966，Tile.Clear 的 TilePaint 位即
  //     ClearBlockPaintAndCoating（Tile.cs:758-762 → :906-911 漆+方块涂层同清）
  //     ——该语义只属运行时 setTile 域（下一条）；
  //   · 世界生成落位 = 直写 tile.active(true)+tile.type（PlaceTile default 支
  //     1457:60725-60741 同形，1456:60258-60262），不动 paint/coat 位——
  //     setTileSilent 曾连 !wasActive 一并清，extraLiquid 泡泡方块（cs:1788-1794
  //     全方格 fullbrightBlock）内后置落位丢亮涂层（waterpark #105 实证），
  //     2026-09-03 勘误为仅 type===0（KillTile 族）清。
  it('setTileSilent（世界生成直写域）：非活性格落位保漆保涂层；active→active 换型同样保留', () => {
    const st = new TileStore(4, 4);
    // 空格遗留漆/涂层（extraLiquid 泡泡方块后置落位链）→ 直写全保留
    st.setPaintSilent(1, 1, 5);
    st.setCoatSilent(1, 1, TileStore.COAT_BLOCK_MASK, TileStore.COAT_FULLBRIGHT_BLOCK);
    st.setTileSilent(1, 1, DIRT);
    expect(st.paint[st.idx(1, 1)]).toBe(5);
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_FULLBRIGHT_BLOCK).toBe(TileStore.COAT_FULLBRIGHT_BLOCK);
    // 已活性格带漆 → 换型保留（草化/转化路径）
    st.setPaintSilent(1, 1, 7);
    st.setTileSilent(1, 1, STONE);
    expect(st.paint[st.idx(1, 1)]).toBe(7);
  });

  it('setTile（运行时 PlaceTile 域）：!active 格落位清漆+方块涂层（PlaceTile 头 Clear，1456:59499-59501/1457:59964-59966）', () => {
    const st = new TileStore(4, 4);
    st.setPaintSilent(1, 1, 5);
    st.setCoatSilent(1, 1, TileStore.COAT_BLOCK_MASK, TileStore.COAT_FULLBRIGHT_BLOCK);
    st.setTile(1, 1, DIRT);
    expect(st.paint[st.idx(1, 1)]).toBe(0);
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_BLOCK_MASK).toBe(0);
  });

  it('KillWall 清墙漆（WorldGen.cs:60425-60426）；铺新墙从零开始', () => {
    const st = new TileStore(4, 4);
    st.setWallSilent(1, 1, 4);
    st.setPaintWallSilent(1, 1, 9);
    st.setWallSilent(1, 1, 0);
    expect(st.paintWall[st.idx(1, 1)]).toBe(0);
    st.setWallSilent(1, 1, 15);
    expect(st.paintWall[st.idx(1, 1)]).toBe(0);
    st.setPaintWallSilent(1, 1, 3);
    st.setWallSilent(1, 1, 16);   // wall→wall 替换保留
    expect(st.paintWall[st.idx(1, 1)]).toBe(3);
  });

  it('setPaint 钳 5bit 域（0-31，越界值 &31）', () => {
    const st = new TileStore(2, 2);
    st.setPaint(0, 0, 33);
    expect(st.paint[st.idx(0, 0)]).toBe(1);
  });
});

describe('存档往返（SaveData.paint/paintWall 独立 RLE 通道）', () => {
  it('saveGame → loadSave：方块漆/墙漆完整保留', () => {
    const w = new World(60, 40, 42, 'paint-test');
    const st = w.store;
    st.setTileSilent(10, 10, DIRT);
    st.setPaintSilent(10, 10, 5);
    st.setWallSilent(11, 11, 4);
    st.setPaintWallSilent(11, 11, 9);
    const p = new Player(100, 100, new Inventory());
    const back = loadSave(saveGame(w, p, 0));
    const st2 = back.world.store;
    expect(st2.paint[st2.idx(10, 10)]).toBe(5);
    expect(st2.paintWall[st2.idx(11, 11)]).toBe(9);
    // 未涂格保持 0
    expect(st2.paint[st2.idx(20, 20)]).toBe(0);
    expect(st2.paintWall[st2.idx(20, 20)]).toBe(0);
  });

  it('旧档缺 paint/paintWall 字段 → 全 0 无漆（同 wire/blocks 缺省容忍）', () => {
    const w = new World(60, 40, 42, 'paint-old');
    w.store.setTileSilent(5, 5, DIRT);
    const json = saveGame(w, new Player(0, 0, new Inventory()), 0);
    const raw = JSON.parse(json) as Record<string, unknown>;
    delete raw.paint;
    delete raw.paintWall;
    const back = loadSave(JSON.stringify(raw));
    const st = back.world.store;
    expect(st.paint.every((v) => v === 0)).toBe(true);
    expect(st.paintWall.every((v) => v === 0)).toBe(true);
  });
});

describe('Item.paint / paintTool 表（Item.cs:13374-13535 / :21168-21185）', () => {
  it('油漆 1073-1099 → PaintID 1-27（含深层 13-24）', () => {
    expect(itemOf(1073)?.paint).toBe(1);   // RedPaint
    expect(itemOf(1084)?.paint).toBe(12);  // PinkPaint
    expect(itemOf(1085)?.paint).toBe(13);  // DeepRedPaint
    expect(itemOf(1096)?.paint).toBe(24);  // DeepPinkPaint
    expect(itemOf(1097)?.paint).toBe(25);  // BlackPaint
    expect(itemOf(1098)?.paint).toBe(26);  // WhitePaint
    expect(itemOf(1099)?.paint).toBe(27);  // GrayPaint
  });

  it('棕/暗影/负相 1966-1968 → 28/29/30', () => {
    expect(itemOf(1966)?.paint).toBe(28);
    expect(itemOf(1967)?.paint).toBe(29);
    expect(itemOf(1968)?.paint).toBe(30);
  });

  it('工具族 paintTool（Player.cs PlaceThing 分派）', () => {
    expect(itemOf(1071)?.paintTool).toBe('brush');
    expect(itemOf(1543)?.paintTool).toBe('brush');    // SpectrePaintbrush
    expect(itemOf(1072)?.paintTool).toBe('roller');
    expect(itemOf(1544)?.paintTool).toBe('roller');
    expect(itemOf(1100)?.paintTool).toBe('scraper');
    expect(itemOf(1545)?.paintTool).toBe('scraper');
    expect(itemOf(1071)?.paint).toBeUndefined();      // 工具无 paint
  });
});

describe('FindPaintOrCoating（Player.cs:41272-41289）', () => {
  it('弹药栏 54-57 优先于背包（:41274-41280 先扫弹药栏）', () => {
    const inv = new Inventory();
    const red = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1073]];
    const blue = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1081]];
    inv.add(blue, 10);        // 进 0-49 背包
    inv.slots[54] = { id: red, stack: 5 };
    expect(inv.findPaintSlot()).toBe(54);
    expect(inv.heldPaintLookup()).toBe(1);
  });

  it('无弹药栏油漆时回落全包首槽（:41281-41287）', () => {
    const inv = new Inventory();
    const blue = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1081]];
    // 直接占住 0-49 背包格（add() 会把油漆自动归入弹药栏 54-57，绕开本路径）
    inv.slots[3] = { id: blue, stack: 3 };
    expect(inv.findPaintSlot()).toBe(3);
    expect(inv.heldPaintLookup()).toBe(9);            // BluePaint → PaintID 9
  });

  it('非油漆物品不被命中（Item.PaintOrCoating :334-344）', () => {
    const inv = new Inventory();
    inv.add(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2]], 99); // 泥土
    expect(inv.findPaintSlot()).toBe(-1);
    expect(inv.heldPaintLookup()).toBe(0);
  });
});

describe('SmartCursor 油漆三策略（SmartCursorHelper.cs:668-807）', () => {
  const brush = () => ({ def: itemOf(1071) ?? null, tool: null });
  const roller = () => ({ def: itemOf(1072) ?? null, tool: null });
  const scraper = () => ({ def: itemOf(1100) ?? null, tool: null });

  /** 玩家在 (100,95)，可达区 ≈ x 95-106 / y 92-99（TileReachCheckSettings.Simple 5/3）。
   *  paintField 把实心行铺在 y=95（玩家所在行），墙铺在 y=96-99 */
  function paintField(st: TileStore): void {
    for (let x = 96; x <= 104; x++) st.setTileSilent(x, 95, DIRT);
    for (let y = 96; y <= 99; y++) {
      for (let x = 96; x <= 104; x++) st.setWallSilent(x, y, 4);
    }
  }

  it('Step_PaintBrush：无油漆（paintLookup=0）→ 目标集恒空（:724 外门）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    expect(scRun(st, mouseAt(100, 95), brush())).toBeNull();
  });

  it('Step_PaintBrush：选离鼠标最近且颜色 != 目标漆的活性格（:733-743）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    st.setPaintSilent(100, 95, 1);   // 已是目标色 → 排除
    const hit = scRun(st, mouseAt(100, 95), brush(), { paintLookup: 1 });
    expect(hit).not.toBeNull();
    expect(hit!.x).not.toBe(100);    // 同色格不可选
    // 鼠标正好在 (101,95) → 最近候选是它
    const hit2 = scRun(st, mouseAt(101, 95), brush(), { paintLookup: 1 });
    expect(hit2).toEqual({ x: 101, y: 95 });
  });

  it('Step_PaintRoller：墙色 != 目标漆且墙前无实心块（:781）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    st.setPaintWallSilent(100, 96, 9); // 已同色 → 排除
    const hit = scRun(st, mouseAt(100, 96), roller(), { paintLookup: 9 });
    expect(hit).not.toBeNull();
    expect(hit).toEqual({ x: 99, y: 96 }); // (99,96) 与 (101,96) 等距取先扫到的 99（100 被排除）
  });

  it('Step_PaintRoller：实心块挡住的墙格不可选（:781 !active || !tileSolid || tileSolidTop）', () => {
    const st = new TileStore(220, 160);
    for (let x = 96; x <= 104; x++) st.setWallSilent(x, 97, 4);
    st.setTileSilent(100, 97, DIRT);   // 实心块正面 → 排除
    const hit = scRun(st, mouseAt(100, 97), roller(), { paintLookup: 9 });
    expect(hit).not.toBeNull();
    expect(hit!.x).not.toBe(100);
  });

  it('Step_PaintScrapper：有漆格/墙漆格为目标（:681-693）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    st.setPaintSilent(97, 95, 5);
    st.setPaintWallSilent(103, 97, 3);
    const a = scRun(st, mouseAt(97, 95), scraper());
    expect(a).toEqual({ x: 97, y: 95 });
    const b = scRun(st, mouseAt(103, 97), scraper());
    expect(b).toEqual({ x: 103, y: 97 });
    // 无漆区（可达区内）→ 无目标
    const st2 = new TileStore(220, 160);
    paintField(st2);
    expect(scRun(st2, mouseAt(100, 95), scraper())).toBeNull();
  });

  it('Step_PaintScrapper：长苔藓 sheet 184 也是目标（:684 tile.type == 184）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    const moss = TILE_BY_KEY['v_184_moss_plants'];
    if (moss === undefined) return; // tile 未注册时跳过（等价于原版不可达态）
    st.setTileSilent(98, 94, moss);
    const hit = scRun(st, mouseAt(98, 94), scraper());
    expect(hit).toEqual({ x: 98, y: 94 });
  });
});

// ★消 flake 根（2026-09-04）：原版绿史莱姆首 AI 帧掷体内物品（slimeRollContainedItem，
// NPC.cs:60750-60960 1:1，Math.random 主桶 1/20 + 副桶 19/20×1/40 ≈ 7%）——掷中即激活
// NPC.cs:60984-61086 物品色 lerp（实证爆红 = ai1=3086 目标 R=59，59×(1−0.95^120)=58.87）。
// 踩漆链无回归；各用例 spawn 后钉 ai1=-1（:60752「已掷=空」哨兵，roll 门 ai1!==0 早退）
// 把渐变面隔离到踩漆路径本身。
describe('史莱姆踩漆 lerp（NPC.cs:60971-61087）', () => {
  it('站在红漆上：颜色向 (255,0,0) 收敛、alpha 向 100 收敛（:60977-60981）', () => {
    const w = new World(64, 48, 7, 'slime-paint');
    // 加固:漆面铺宽(史莱姆 AI 朝玩家跳,8 格窄面会走出界掉底——2026-08-22 flaky 定位)
    for (let x = 8; x < 56; x++) w.store.setTileSilent(x, 30, DIRT);
    w.store.setPaintSilent(30, 30, 1);   // 红漆
    for (let x = 8; x < 56; x++) if (x !== 30) w.store.setPaintSilent(x, 30, 1); // 全面红漆(排除 !=30 负相门)
    const e = Enemy.fromVanilla(1, 30 * TILE, 28 * TILE); // 绿史莱姆（type 1）
    expect(e).not.toBeNull();
    expect(e!.colorRGBA).not.toBeNull();
    e!.ai1 = -1;   // 钉死体内物品掷骰（见 describe 头注释）
    const before = [...e!.colorRGBA!];
    const p = new Player(40 * TILE, 20 * TILE, new Inventory());   // 玩家放漆面中央上方,史莱姆双向跳跃不出界
    const h = hooks(w, p);
    for (let i = 0; i < 240 && !e!.dead; i++) e!.fixedUpdate(1 / 60, h);
    const after = e!.colorRGBA!;
    // 至少发生过一次 (c*19+target)/20 迈向 (255,0,0)
    expect(after[0]).toBeGreaterThan(before[0]);
    expect(after[1]).toBeLessThan(before[1]);
    // alpha 目标恒 100（:60980）：史莱姆初始 alpha=100 → 保持 100
    expect(after[3]).toBe(100);
  });

  it('负相漆 30 不触发 lerp（:60977 color() != 30 门）', () => {
    const w = new World(64, 48, 7, 'slime-neg');
    for (let x = 28; x < 36; x++) w.store.setTileSilent(x, 30, DIRT);
    w.store.setPaintSilent(30, 30, 30);
    const e = Enemy.fromVanilla(1, 30 * TILE, 28 * TILE)!;
    e.ai1 = -1;   // 钉死体内物品掷骰（见 describe 头注释）
    const before = [...e.colorRGBA!];
    const h = hooks(w, new Player(4 * TILE, 20 * TILE, new Inventory()));
    for (let i = 0; i < 120 && !e.dead; i++) e.fixedUpdate(1 / 60, h);
    // 负相漆不吃：R 不向 200 收敛（无 ai[1] 物品色，颜色应基本不变）
    expect(Math.abs(e.colorRGBA![0] - before[0])).toBeLessThanOrEqual(1);
  });

  it('无漆立足点 → 不变色（无 ai[1] 体内物品时全静默）', () => {
    const w = new World(64, 48, 7, 'slime-plain');
    for (let x = 8; x < 56; x++) w.store.setTileSilent(x, 30, DIRT);   // 加固:宽台防走出界
    const e = Enemy.fromVanilla(1, 30 * TILE, 28 * TILE)!;
    e.ai1 = -1;   // 钉死体内物品掷骰（见 describe 头注释）
    const before = [...e.colorRGBA!];
    const h = hooks(w, new Player(4 * TILE, 20 * TILE, new Inventory()));
    for (let i = 0; i < 120 && !e.dead; i++) e.fixedUpdate(1 / 60, h);
    expect(e.colorRGBA![0]).toBeCloseTo(before[0], 5);
    expect(e.colorRGBA![1]).toBeCloseTo(before[1], 5);
  });

  it('油漆格不实心（空气/平台）不算立足点（SolidTile3 :70470-70489）', () => {
    const w = new World(64, 48, 7, 'slime-nonsolid');
    // 立足行全空、只给一格平台刷漆（tileSolidTop 不算）
    const st = w.store;
    const plat = TILE_BY_KEY['platform'];
    if (plat === undefined) return;
    for (let x = 28; x < 36; x++) st.setTileSilent(x, 31, DIRT); // 底下一行实心
    st.setTileSilent(30, 30, plat);
    st.setPaintSilent(30, 30, 1);
    st.setPaintSilent(31, 30, 1); // 空气格遗留漆
    const e = Enemy.fromVanilla(1, 30 * TILE, 28 * TILE)!;
    e.ai1 = -1;   // 钉死体内物品掷骰（见 describe 头注释）
    const before = [...e.colorRGBA!];
    const h = hooks(w, new Player(4 * TILE, 20 * TILE, new Inventory()));
    for (let i = 0; i < 120 && !e.dead; i++) e.fixedUpdate(1 / 60, h);
    expect(Math.abs(e.colorRGBA![0] - before[0])).toBeLessThanOrEqual(1);
  });
});

describe('油漆师商店链（Chest.SetupShop case 15 :2416-2455 → 我方 vanilla-shopstock）', () => {
  it('227 主店进货：三件套 + 常驻黑灰白棕 + hardMode 门 1967/1968 + 墓地门 4668/5344', async () => {
    const j = (await import('../src/data/vanilla-shopstock.json')).default as {
      shops: Record<string, Array<{ id: number; cond: string | null }>>;
    };
    const stock = j.shops['227'];
    const ids = stock.map((e) => e.id);
    expect(ids).toContain(1071);   // Paintbrush :2418
    expect(ids).toContain(1072);   // PaintRoller :2420
    expect(ids).toContain(1100);   // PaintScraper :2422
    expect(ids).toContain(1097);   // Black :2429
    expect(ids).toContain(1099);   // Gray :2431
    expect(ids).toContain(1098);   // White :2433
    expect(ids).toContain(1966);   // Brown :2435
    expect(ids).toContain(1967);   // Shadow（hardMode 门 :2437-2441）
    expect(ids).toContain(1968);   // Negative（同上）
    expect(ids).toContain(4668);   // 荧光涂层（墓地门 :2444-2446）
    expect(ids).toContain(5344);   // 回声涂层（墓地+世花门 :2448-2450）
    // 1073-1084 基础 12 色是 for 循环上架（:2424-2428），extract-shops 不展开 →
    // 由 Game.shopStockFor 直补（见 shopStockFor 内 227 分支）；此处锁全部进货可购买
    for (const id of [...ids, ...Array.from({ length: 12 }, (_, i) => 1073 + i)]) {
      expect(VANILLA_ITEM_KEY_BY_ID[id]).toBeDefined();
      expect(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[id]]).toBeDefined();
    }
    // hardMode 门挂对条目（Shadow/Negative 仅困难模式上架）
    expect(stock.find((e) => e.id === 1967)?.cond).toBe('hardMode');
    expect(stock.find((e) => e.id === 1968)?.cond).toBe('hardMode');
  });

  it('油漆物品可入弹药格（Item.FitsAmmoSlot :1351-1367 PaintOrCoating 豁免）', async () => {
    const { ammoSlotAccepts } = await import('../src/items/Inventory');
    expect(ammoSlotAccepts(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1073]])).toBe(true);
    expect(ammoSlotAccepts(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1968]])).toBe(true);
    expect(ammoSlotAccepts(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2]])).toBe(false); // 泥土不收
  });

  it('tile 定义消费就绪：DIRT/STONE 有 mapColor 供 Minimap LUT（vanillaMapColors 链）', () => {
    expect(TILE_DEFS[DIRT]?.vanilla?.sheet).toBeDefined();
    expect(TILE_DEFS[STONE]?.vanilla?.sheet).toBeDefined();
  });
});

describe('.wld 导入油漆链（WorldFile.cs:2571-2586 → SaveData.paint/paintWall）', () => {
  const WLD = require('node:path').join(__dirname, '..', 'Starter_World Master.wld');
  it.skipIf(!require('node:fs').existsSync(WLD))(
    '真实地图：解析出的油漆域 ∈ [0,31] 且导入链落盘字段存在',
    async () => {
      const { readFileSync } = await import('node:fs');
      const { parseWld } = await import('../src/wld/WldParser');
      const { parseWldToSave } = await import('../src/wld/WldImport');
      const buf = new Uint8Array(readFileSync(WLD));
      const wld = parseWld(buf);
      // 域完整性：5bit 油漆域不可能越界（越界 = header 位错读，会连锁错位后续字节）
      for (let i = 0; i < wld.tiles.paint.length; i += 997) {
        expect(wld.tiles.paint[i]).toBeLessThanOrEqual(31);
        expect(wld.tiles.paintWall[i]).toBeLessThanOrEqual(31);
      }
      // 导入链落盘字段就位（rlePairs 通道）
      const { save } = parseWldToSave(buf);
      expect(typeof save.paint).toBe('string');
      expect(typeof save.paintWall).toBe('string');
      // 往返：loadSave 后油漆域一致（抽样比对 parser 原值）
      const { world } = loadSave(JSON.stringify(save));
      const st = world.store;
      for (let i = 0; i < wld.tiles.paint.length; i += 4099) {
        const x = i % st.w, y = Math.floor(i / st.w);
        if (!st.inBounds(x, y)) continue;
        const j = st.idx(x, y);
        expect(st.paint[j]).toBe(wld.tiles.paint[i] & 31);
        expect(st.paintWall[j]).toBe(wld.tiles.paintWall[i] & 31);
      }
    },
  );
});
