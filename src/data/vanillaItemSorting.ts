// ItemSorting.GetSortingLayerIndex（Terraria.UI/ItemSorting.cs:1555-1558）运行时读取面。
// 数据 = vanilla-itemsorting.json v2（tools/extract-itemsorting.mjs ★SW-FX29 自 1457
// 直提:ItemID.Count 6196,SetupWhiteLists 52 层白名单 + 21 张 SortingPriority 集 +
// 逐 vid 属性面;2026-08-20 旧版为 1456/6147 条,缺 1457 新物品 6147-6195）。
// 消费方 = QuickStacking smart 档（TryGetBestDestinationForCategory 的 GetCategory
// :219-222）+ ItemSorting 排序引擎（src/stats/ItemSorting.ts）。
import raw from './vanilla-itemsorting.json';

const LAYERS = (raw as { layers: Record<string, number> }).layers;

/** GetSortingLayerIndex（:1553）：类型 → 分类层下标（0-51；前四层 = 玩家四系
 *  伤害倍率序，加载期玩家未载入全 1 → 固定 Melee/Ranged/Magic/Minions）。
 *  未知类型 → 0（原版 _layerIndexForItemType 数组默认值语义） */
export function sortingLayerIndex(vanillaItemId: number): number {
  const v = LAYERS[String(vanillaItemId)];
  return v === undefined ? 0 : v;
}
