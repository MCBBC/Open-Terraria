// ItemSorting.GetSortingLayerIndex（Terraria.UI/ItemSorting.cs:1553-1556）运行时读取面。
// 数据 = vanilla-itemsorting.json（tools/extract-itemsorting.mjs 从 ItemSorting.cs
// SetupWhiteLists 48+4 层谓词 + ItemID.Sets SortingPriority* 全表 + Item.cs SetDefaults
// 字段提取，2026-08-20）。消费方 = QuickStacking smart 档（TryGetBestDestinationForCategory
// 的 GetCategory :219-222）。
import raw from './vanilla-itemsorting.json';

const LAYERS = (raw as { layers: Record<string, number> }).layers;

/** GetSortingLayerIndex（:1553）：类型 → 分类层下标（0-51；前四层 = 玩家四系
 *  伤害倍率序，加载期玩家未载入全 1 → 固定 Melee/Ranged/Magic/Minions）。
 *  未知类型 → 0（原版 _layerIndexForItemType 数组默认值语义） */
export function sortingLayerIndex(vanillaItemId: number): number {
  const v = LAYERS[String(vanillaItemId)];
  return v === undefined ? 0 : v;
}
