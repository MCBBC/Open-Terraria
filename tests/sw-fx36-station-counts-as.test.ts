// SW-FX36 2026-09：合成站 TileCountsAs 向下兼容邻接（用户实报：地狱熔炉做不了熔炉配方）
//
// 原版权威（Terarria1457）：
//   Player.AdjTiles                 Player.cs:35941-35963 —— 扫描 reach 区，每个 active tile 调 SetAdjTile(tile.type)
//   Player.SetAdjTile               Player.cs:35920-35939 —— adjTile[tileType]=true 后沿 Recipe.TileCountsAs[tileType]
//                                     【递归】置位等价 tile（alchemyTable=355/699 侧门同处）
//   Recipe.SetupTileInheritance     Recipe.cs:559-571 —— 继承全表（9 对）：
//     96 汤锅→215 篝火; 17 熔炉→215 篝火; 302 玻璃窑→17 熔炉; 77 地狱熔炉→17 熔炉;
//     133 钛金熔炉→77 地狱熔炉; 134 秘银砧→16 铁砧; 355 炼金桌→13 药水瓶; 699→13; 304 活织布机→86 织布机
//   Recipe.PlayerMeetsEnvironmentConditions Recipe.cs:325 —— 只查 player.adjTile[requiredTile]
//   （即【邻近 tile 侧】沿链继承：近 77 ⇒ adjTile[77,17]；钴锭 requiredTile=17 @Recipe.cs:11343）
//
// 本仓病灶定谳：envOk 曾把链展开在 requiredTile 侧（expandStationTiles(r.tile) 扩 [17→215]）——
//   方向反置 ⇒ 近地狱熔炉(77)做不了熔炉(17)配方（本实报）、近秘银砧(134)做不了铁砧(16)配方、
//   近玻璃窑(302)/钛金熔炉(133)做不了熔炉配方、近营火(215)反而误解锁熔炉配方。
// 修复：stationSatisfierTiles(R) = {R}∪后裔闭包（"谁 counts-as R"），对邻近 internal tile 集判定。
import { describe, it, expect } from 'vitest';
import {
  envOk, availableRecipes, VANILLA_RECIPES, TILE_COUNTS_AS, stationSatisfierTiles,
  invIndexOfVanilla, type VanillaCraftCtx,
} from '../src/data/vanillaRecipes';
import { TILE_DEFS } from '../src/data/tiles';
import { Inventory } from '../src/items/Inventory';

/** vanilla.sheet（原版 tile id）→ 本仓 internal tile id（vanillaRecipes.SHEET_TO_INTERNAL 同构） */
const internalOfSheet = (sheet: number): number => {
  const i = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
  expect(i).toBeGreaterThanOrEqual(0);   // 数据面缺站 tile = 直接爆红（不许静默近似）
  return i;
};

const ctxNear = (...sheets: number[]): VanillaCraftCtx => ({
  nearbyInternal: new Set(sheets.map(internalOfSheet)),
});

// 样本配方（repo vanilla-recipes.json 与原版 Recipe.cs requiredTile 已对账）
const cobaltBar = VANILLA_RECIPES.find((r) => r.create === 381 && r.tile === 17)!;    // 钴锭 @熔炉
const leadBar = VANILLA_RECIPES.find((r) => r.create === 704 && r.tile === 17)!;      // 铅锭 @熔炉
const tungstenBar = VANILLA_RECIPES.find((r) => r.create === 705 && r.tile === 17)!;  // 钨锭 @熔炉
const glass = VANILLA_RECIPES.find((r) => r.create === 170 && r.tile === 17)!;        // 玻璃 @熔炉
const cookedMarshmallow = VANILLA_RECIPES.find((r) => r.create === 172 && r.tile === 77)!; // 烤棉花糖 @地狱熔炉
const anvilRecipe = VANILLA_RECIPES.find((r) => r.create === 47 && r.tile === 16)!;   // 邪恶箭 @铁砧
const mythrilAnvilRecipe = VANILLA_RECIPES.find((r) => r.tile === 134)!;              // 秘银砧专属
const loomRecipe = VANILLA_RECIPES.find((r) => r.create === 225 && r.tile === 86)!;   // 丝绸 @织布机
const livingLoomRecipe = VANILLA_RECIPES.find((r) => r.tile === 304)!;                // 活织布机专属
const campfireRecipe = VANILLA_RECIPES.find((r) => r.create === 1128 && r.tile === 215)!; // 篝火专属
const cookingPotRecipe = VANILLA_RECIPES.find((r) => r.tile === 96)!;                 // 汤锅专属
const bottleRecipe = VANILLA_RECIPES.find((r) => r.create === 28 && r.tile === 13)!;  // 弱化治疗药水 @药水瓶
const glassKilnRecipe = VANILLA_RECIPES.find((r) => r.tile === 302)!;                 // 玻璃窑专属

describe('SW-FX36 TileCountsAs 继承表（Recipe.cs:559-571 全表对账）', () => {
  it('本仓 tileCountsAs 与 1457 原版 9 对逐一相等', () => {
    expect(TILE_COUNTS_AS).toEqual({
      '96': 215, '17': 215, '302': 17, '77': 17, '133': 77,
      '134': 16, '355': 13, '699': 13, '304': 86,
    });
  });

  it('替身集（后裔闭包）= 邻近 tile 能置位 adjTile[R] 的全集', () => {
    expect([...stationSatisfierTiles(17)].sort((a, b) => a - b)).toEqual([17, 77, 133, 302]);
    expect([...stationSatisfierTiles(77)].sort((a, b) => a - b)).toEqual([77, 133]);
    expect([...stationSatisfierTiles(16)].sort((a, b) => a - b)).toEqual([16, 134]);
    expect([...stationSatisfierTiles(13)].sort((a, b) => a - b)).toEqual([13, 355, 699]);
    expect([...stationSatisfierTiles(86)].sort((a, b) => a - b)).toEqual([86, 304]);
    // 篝火的替身含整条熔炉族（17→215 ⇒ 近熔炉可做篝火配方）
    expect([...stationSatisfierTiles(215)].sort((a, b) => a - b)).toEqual([17, 77, 96, 133, 215, 302]);
    expect([...stationSatisfierTiles(134)].sort((a, b) => a - b)).toEqual([134]);
    expect([...stationSatisfierTiles(18)].sort((a, b) => a - b)).toEqual([18]);
  });
});

describe('SW-FX36 高级站向下兼容（近高级站可做基础站配方）', () => {
  it('近地狱熔炉(77)：钴/铅/钨锭+玻璃（tile 17）全可做', () => {
    const ctx = ctxNear(77);
    expect(envOk(cobaltBar, ctx)).toBe(true);
    expect(envOk(leadBar, ctx)).toBe(true);
    expect(envOk(tungstenBar, ctx)).toBe(true);
    expect(envOk(glass, ctx)).toBe(true);
  });

  it('近地狱熔炉(77)：地狱熔炉配方(77)本身可做；但秘银砧配方(134)不可越权', () => {
    const ctx = ctxNear(77);
    expect(envOk(cookedMarshmallow, ctx)).toBe(true);
    expect(envOk(mythrilAnvilRecipe, ctx)).toBe(false);
  });

  it('近秘银砧(134)：铁砧配方(16)可做', () => {
    const ctx = ctxNear(134);
    expect(envOk(anvilRecipe, ctx)).toBe(true);
    expect(envOk(cookedMarshmallow, ctx)).toBe(false);   // 134→16，不上溯 77
  });

  it('近钛金熔炉(133)：熔炉(17)与地狱熔炉(77)配方皆可做（133→77→17 传递）', () => {
    const ctx = ctxNear(133);
    expect(envOk(cobaltBar, ctx)).toBe(true);
    expect(envOk(cookedMarshmallow, ctx)).toBe(true);
  });

  it('近玻璃窑(302)：熔炉配方(17)可做；地狱熔炉配方(77)不可越权', () => {
    const ctx = ctxNear(302);
    expect(envOk(cobaltBar, ctx)).toBe(true);
    expect(envOk(cookedMarshmallow, ctx)).toBe(false);
  });

  it('近活织布机(304)：织布机配方(86)可做；近汤锅(96)：篝火配方(215)可做；篝火不解锁汤锅专属', () => {
    expect(envOk(loomRecipe, ctxNear(304))).toBe(true);
    expect(envOk(campfireRecipe, ctxNear(96))).toBe(true);
    // 96→215 单向：近篝火只置 adjTile[215]，不上行解锁汤锅(96)专属配方
    expect(envOk(cookingPotRecipe, ctxNear(96))).toBe(true);
    expect(envOk(cookingPotRecipe, ctxNear(215))).toBe(false);
  });

  it('近炼金桌(355)/DeadCells 药剂站(699)：药水瓶配方(13)可做', () => {
    expect(envOk(bottleRecipe, ctxNear(355))).toBe(true);
    expect(envOk(bottleRecipe, ctxNear(699))).toBe(true);
  });

  it('近玻璃窑(302)：玻璃窑配方可做；同配方在裸熔炉旁不可越权（302 专属不上行）', () => {
    expect(envOk(glassKilnRecipe, ctxNear(302))).toBe(true);
    expect(envOk(glassKilnRecipe, ctxNear(17))).toBe(false);
  });
});

describe('SW-FX36 基础站行为不回归（继承只向下，不向上）', () => {
  it('近熔炉(17)：熔炉配方可做 + 篝火配方(215)可做（原版 17→215），铁砧(16)不可', () => {
    const ctx = ctxNear(17);
    expect(envOk(cobaltBar, ctx)).toBe(true);
    expect(envOk(campfireRecipe, ctx)).toBe(true);
    expect(envOk(anvilRecipe, ctx)).toBe(false);
  });

  it('近营火(215)：熔炉配方【不可】做（继承反方向禁止——本刀前的反向 bug 面）', () => {
    expect(envOk(cobaltBar, ctxNear(215))).toBe(false);
  });

  it('近工作台(18)：熔炉/铁砧配方皆不可；空邻集：带站配方不可、徒手配方可', () => {
    const wb = ctxNear(18);
    expect(envOk(cobaltBar, wb)).toBe(false);
    expect(envOk(anvilRecipe, wb)).toBe(false);
    const bare: VanillaCraftCtx = { nearbyInternal: new Set() };
    expect(envOk(cobaltBar, bare)).toBe(false);
    expect(envOk(VANILLA_RECIPES.find((r) => r.tile === -1)!, bare)).toBe(true);
  });
});

describe('SW-FX36 用户面端到端（availableRecipes 列表 = 用户实报路径）', () => {
  it('背包 3 钴矿 + 近地狱熔炉 → 钴锭进可用列表；近营火 → 不进', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: invIndexOfVanilla(364), stack: 3 };   // 钴矿 ×3
    const atForge = availableRecipes(inv, ctxNear(77));
    expect(atForge.some((e) => e.r === cobaltBar)).toBe(true);
    const atCampfire = availableRecipes(inv, ctxNear(215));
    expect(atCampfire.some((e) => e.r === cobaltBar)).toBe(false);
  });

  it('背包 2 沙 + 近地狱熔炉 → 玻璃进可用列表（用户实报抽样）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: invIndexOfVanilla(169), stack: 2 };   // 沙 ×2
    expect(availableRecipes(inv, ctxNear(77)).some((e) => e.r === glass)).toBe(true);
  });

  it('背包 20 木箭+1 蠕虫牙 + 近秘银砧 → 邪恶箭（铁砧系 create 47）进可用列表', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: invIndexOfVanilla(40), stack: 20 };   // 木箭 ×20
    inv.slots[11] = { id: invIndexOfVanilla(69), stack: 1 };    // 蠕虫牙 ×1
    expect(availableRecipes(inv, ctxNear(134)).some((e) => e.r === anvilRecipe)).toBe(true);
  });
});
