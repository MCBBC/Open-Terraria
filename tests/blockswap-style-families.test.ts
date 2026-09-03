// 方块交换 style 族 verdict 行为锁定（2026-09-03 清偿批①）。
// 标杆 PlaceThing_ValidTileForReplacement（Terarria1457 Player.cs:40232-40351）——
// 族段（:40270-40316 平台/火把/篝火/箱/柜）+ 前置否决门（:40242-40268）+ 回落尾段
// （:40318-40350 含 WouldTileReplacementWork WorldGen.cs:63209-63242）逐支 1:1 对拍。
// 旧仓近似（逐 style 除法表）的三向失真（非同族放置物误放行/无液面门/同型换饿死）
// 各有反例案钉死。
import { describe, it, expect } from 'vitest';
import { validTileForReplacementFamilies } from '../src/core/Game';

const base = {
  targetSheet: -1, placedSheet: -1, style: 0, targetFrameX: 0, targetFrameY: 0,
  targetLiquid: 0, placedItemId: -1, targetDropIsPlacedItem: false,
  playerOverlapsTargetTile: false, getGoodWorld: false,
};
const ctx = (o: Partial<typeof base>) => ({ ...base, ...o });

// 原版 tile sheet：19 木平台 / 427 队红平台 / 4 火炬 / 215 篝火 / 21 箱 / 467 Containers2
// / 88 梳妆台 / 0 土 / 2 草 / 182 苔 / 477 高尔夫草 / 633 灰烬草 / 380 花箱 / 230 CrispyHoneyBlock

describe('前置否决门（Player.cs:40242-40268）', () => {
  it(':40242 绳类物品（SortingPriorityRopes {85,965,2996,3077,3078}）不做方块交换', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 213, placedItemId: 85,
    }))).toBe(false);
    // 非绳物品不受此门
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 0, placedItemId: 2,
    }))).toBe(true);
  });

  it(':40245 放置物为苔（Main.tileMoss {179-183,381,534,536,539,625,627}）→ false', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 4, placedSheet: 182,
    }))).toBe(false);
  });

  it(':40248 DoesntPlaceWithTileReplacement{2,60,70,109,199,23,661,662,633} → false', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 4, placedSheet: 2,
    }))).toBe(false);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 633,
    }))).toBe(false);
  });

  it(':40261 平台目标+非平台放置物+玩家盒相交 → false（CheckPlatformSolidity）', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 0, playerOverlapsTargetTile: true,
    }))).toBe(false);
    // 放置物也是平台 → 无实体门（:40363 条件第一支不成立）
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 19, style: 1, targetFrameY: 0,
      playerOverlapsTargetTile: true,
    }))).toBe(true);
    // 非平台目标不查实体门（:40363 只对 Platforms∪{380} 目标）
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 4, placedSheet: 4, style: 1, targetFrameY: 0,
      playerOverlapsTargetTile: true,
    }))).toBe(true);
  });
});

describe('平台族（:40270-40272 + 尾段回落）', () => {
  it('同型同 style（frameY==style*18）→ false：不换', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 19, style: 0, targetFrameY: 0,
    }))).toBe(false);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 19, style: 3, targetFrameY: 3 * 18,
    }))).toBe(false);
  });

  it('同型异 style（frameY!=style*18）→ true：style 转换', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 19, style: 2, targetFrameY: 0,
    }))).toBe(true);
  });

  it('异型平台（19→427）→ true（族段不命中 → 尾段 IsValidPlatform 双真）', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 427, style: 0, targetFrameY: 36,
    }))).toBe(true);
  });

  it('实心放置物（土）→ true（尾段 flag4：两侧皆"实心或平台"）', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 0,
    }))).toBe(true);
  });

  it('frameImportant 非平台放置物（炬）→ false（:40326 尾段 tileFrameImportant 门）', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 4,
    }))).toBe(false);
  });
});

describe('火把族（:40274-40290）', () => {
  it('同型异 style → true；同型同 style → false', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 4, placedSheet: 4, style: 2, targetFrameY: 0,
    }))).toBe(true);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 4, placedSheet: 4, style: 0, targetFrameY: 0,
    }))).toBe(false);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 4, placedSheet: 4, style: 2, targetFrameY: 2 * 22,
    }))).toBe(false);
  });

  it('液面门：淹没炬 + 非水炬 style（∉{8,11,17}）→ false', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 4, placedSheet: 4, style: 0, targetFrameY: 0, targetLiquid: 200,
    }))).toBe(false);
  });

  it('液面门：淹没炬 + 水炬 style（8/11/17 WaterPlacement=Allowed）→ 走同型 frameY 判', () => {
    // style 8（咒火炬）在 tile-anchors sheet4 liqStyles{8,11,17}=allowed → 判同型 frameY
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 4, placedSheet: 4, style: 8, targetFrameY: 0, targetLiquid: 200,
    }))).toBe(true);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 4, placedSheet: 4, style: 17, targetFrameY: 17 * 22, targetLiquid: 255,
    }))).toBe(false);
  });

  it('非炬放置物 → false（同型支不命中 → 尾段 WouldTileReplacementWork 全假）', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 4, placedSheet: 0,
    }))).toBe(false);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 4, placedSheet: 19,   // 平台放炬目标 → flag4 双平台支不齐 → false
    }))).toBe(false);
  });
});

describe('篝火族（:40292-40301）', () => {
  it('同型异 style（frameX/54）→ true；同 style → false', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 215, placedSheet: 215, style: 1, targetFrameX: 0,
    }))).toBe(true);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 215, placedSheet: 215, style: 0, targetFrameX: 0,
    }))).toBe(false);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 215, placedSheet: 215, style: 2, targetFrameX: 2 * 54,
    }))).toBe(false);
  });

  it('液面门：淹没篝火 + WaterPlacement!=Allowed 的放置 style → false', () => {
    // sheet 4（炬）基档 water=notAllowed（tile-anchors sheet4 liq 基档）→ 拒
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 215, placedSheet: 4, style: 0, targetLiquid: 100,
    }))).toBe(false);
    // 平台基档 water=allowed → 过液门；同型支不命中 → 尾段 false
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 215, placedSheet: 19, style: 0, targetLiquid: 100,
    }))).toBe(false);
  });

  it('实心放置物（土）→ false（尾段 flag4 目标侧非实心非平台）', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 215, placedSheet: 0,
    }))).toBe(false);
  });
});

describe('箱族（:40303-40309 BasicChest={21,467}）', () => {
  it('同型同 style（frameX/36==style）→ false；同型异 style → true', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 21, placedSheet: 21, style: 0, targetFrameX: 0,
    }))).toBe(false);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 21, placedSheet: 21, style: 4, targetFrameX: 0,
    }))).toBe(true);
  });

  it('跨型同 style（21↔467）→ true（tile.type!=type 支）', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 21, placedSheet: 467, style: 0, targetFrameX: 0,
    }))).toBe(true);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 467, placedSheet: 21, style: 2, targetFrameX: 2 * 36,
    }))).toBe(false);
  });

  it('非箱放置物 → false（尘换箱旧近似误放行,现按 :40326/:63209 尾段拒）', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 21, placedSheet: 0, targetFrameX: 36,   // 旧近似:36/36=1!=0 → 误 true
    }))).toBe(false);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 21, placedSheet: 19, targetFrameX: 36,
    }))).toBe(false);
  });
});

describe('梳妆台族（:40311-40316 BasicDresser={88}）', () => {
  it('同型同 style → false；异 style → true；非柜放置物 → false', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 88, placedSheet: 88, style: 0, targetFrameX: 0,
    }))).toBe(false);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 88, placedSheet: 88, style: 3, targetFrameX: 0,
    }))).toBe(true);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 88, placedSheet: 0, targetFrameX: 54,
    }))).toBe(false);
  });
});

describe('回落尾段（:40318-40350 + WouldTileReplacementWork :63209-63242）', () => {
  it(':40338 掉落物门：目标掉落==放置物 → false；{158,30} 放置物豁免', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 0, targetDropIsPlacedItem: true,
    }))).toBe(false);
  });

  it(':63216 Conversion.Grass{2,23,199,109,477,492}/633 放置物 → false', () => {
    // 477 高尔夫草不在 DoesntPlaceWithTileReplacement——只被 WouldTileReplacementWork 拦
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 477,
    }))).toBe(false);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 19, placedSheet: 633,
    }))).toBe(false);
  });

  it(':40334 目标 230（CrispyHoneyBlock）× getGoodWorld → false', () => {
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 230, placedSheet: 0, getGoodWorld: true,
    }))).toBe(false);
    expect(validTileForReplacementFamilies(ctx({
      targetSheet: 230, placedSheet: 0, getGoodWorld: false,
    }))).toBe(true);
  });
});
