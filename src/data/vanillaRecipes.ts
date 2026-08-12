// 原版配方数据运行时（tools/extract-recipes.mjs 从 Terarria1456 Recipe.cs 提取，2688 条）。
// 可用性 = Recipe.UpdateRecipeList（Recipe.cs:229-258）：环境条件（站点/液体/群系）× 材料计数。
// 组匹配 = RecipeGroup（id 假偏移 1000000，Recipe.cs:20）——组计数 = 组内所有物品持有数之和。
import recipesJson from './vanilla-recipes.json';
import { itemCombat } from './vanillaItemCombat';
import { TILE_DEFS, TILE_BY_KEY } from './tiles';
import { ITEM_DEFS } from './items';
import type { Inventory } from '../items/Inventory';

export interface VanillaRecipe {
  create: number;          // 原版 item id
  createStack: number;
  tile: number;           // 站点 TileID（-1=徒手）
  items: Array<{ id: number; stack: number }>;
  groups: number[];
  honey?: boolean; water?: boolean; lava?: boolean;
  snow?: boolean; graveyard?: boolean; alchemy?: boolean;
  /** decraft 族(2026-08-13 提取器补提,Recipe.cs 裸赋值 :1064/:1140/:1145) */
  notDecraftable?: boolean;
  crimson?: boolean;
  corruption?: boolean;
  /** AddCustomShimmerResult(:173)——decraft 产物覆盖表 [[id,stack],...] */
  shimmer?: Array<[number, number]>;
}

const DOC = recipesJson as unknown as {
  count: number;
  groups: Record<string, number>;
  groupItems: Record<string, number[]>;
  tileCountsAs: Record<string, number>;
  recipes: VanillaRecipe[];
};
export const VANILLA_RECIPES = DOC.recipes;
export const RECIPE_GROUPS = DOC.groups;
export const RECIPE_GROUP_ITEMS = DOC.groupItems;
export const TILE_COUNTS_AS = DOC.tileCountsAs;

/** 站点继承递归展开（Player.SetAdjTile :35192-35208）：tile 本身 + CountsAs 链全部置位 */
// ================= decraft 索引表（Recipe.UpdateWhichItemsAreCrafted :15110-15127 1:1） =================
// 注册序遍历后写 = last-wins（原版同款）; notDecraftable 跳过 IsCrafted;
// crimson/corruption 配方写各自专属表（GetDecraftingRecipeIndex 按世界 evil 取用）。
// 惰性构建一次（模块加载即建,3173 条线性扫）。
const IS_CRAFTED = new Map<number, number>();
const IS_CRAFTED_CRIMSON = new Map<number, number>();
const IS_CRAFTED_CORRUPTION = new Map<number, number>();
{
  const rs = DOC.recipes;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    if (!r.notDecraftable) IS_CRAFTED.set(r.create, i);
    if (r.crimson) IS_CRAFTED_CRIMSON.set(r.create, i);
    if (r.corruption) IS_CRAFTED_CORRUPTION.set(r.create, i);
  }
}

/** ShimmerTransforms.GetDecraftingRecipeIndex（ShimmerTransforms.cs:15-31）:
 *  IsCrafted<0 → -1;猩红世界取 crimson 表(≥0 才用),腐化世界同理,否则 IsCrafted */
export function getDecraftingRecipeIndex(vid: number, crimsonWorld: boolean): number {
  const base = IS_CRAFTED.get(vid) ?? -1;
  if (base < 0) return -1;
  if (crimsonWorld) {
    const c = IS_CRAFTED_CRIMSON.get(vid) ?? -1;
    if (c >= 0) return c;
  } else {
    const c = IS_CRAFTED_CORRUPTION.get(vid) ?? -1;
    if (c >= 0) return c;
  }
  return base;
}

/** 按索引取配方（decraft 执行端用） */
export function recipeAt(index: number): VanillaRecipe | undefined {
  return DOC.recipes[index];
}

export function expandStationTiles(tile: number): number[] {
  const out = [tile];
  let cur = tile;
  for (let hop = 0; hop < 6; hop++) {
    const next = TILE_COUNTS_AS[String(cur)];
    if (next === undefined) break;
    out.push(next);
    cur = next;
  }
  return out;
}

/** vi_<id> key → 原版 item id 反解 */
export function vanillaIdOfItemKey(key: string): number {
  const m = key.match(/^vi_(\d+)_/);
  return m ? Number(m[1]) : -1;
}

/** 玩家持有的原版 id 计数表（含 RecipeGroup 假 id 聚合，Recipe.cs:408-415） */
export function collectOwnedItems(inv: Inventory): Map<number, number> {
  const owned = new Map<number, number>();
  const add = (vid: number, n: number) => owned.set(vid, (owned.get(vid) ?? 0) + n);
  const inc = (key: string, stack: number) => {
    const def = ITEM_DEFS[inv[key as never] as unknown as number];
    void def;
  };
  void inc;
  // slots 0-57（背包+钱币+弹药）
  for (const s of inv.slots) {
    if (!s) continue;
    const def = ITEM_DEFS[s.id];
    if (!def) continue;
    const vid = def.vid ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : -1);
    if (vid >= 0) add(vid, s.stack);
  }
  // RecipeGroup 假 id 聚合（组内所有物品持有数之和）
  for (const [gidS, items] of Object.entries(RECIPE_GROUP_ITEMS)) {
    let sum = 0;
    for (const it of items) sum += owned.get(it) ?? 0;
    if (sum > 0) add(1000000 + Number(gidS), sum);
  }
  return owned;
}

/** 材料槽 → 所属组（CreateRequiredItemQuickLookups :15043-15056：槽 id 命中本配方
 *  接受组的 ValidItems → 该槽重标记为组）。哨兵 id(≥1000000,提取器遗留)按同义处理 */
function groupOf(r: VanillaRecipe, reqId: number): number {
  if (reqId >= 1000000) return reqId - 1000000;
  for (const g of r.groups) {
    if ((RECIPE_GROUP_ITEMS[String(g)] ?? []).includes(reqId)) return g;
  }
  return -1;
}

/** 材料匹配（RequiredItemEntry.Matches Recipe.cs:35-42）：组槽 = 组内全体持有量之和
 *  （collectOwnedItems 已按假 id 聚合）——持 Boreal 木(5215)可满足 Wood 组槽 */
function itemMatches(r: VanillaRecipe, reqId: number, owned: Map<number, number>): number {
  const g = groupOf(r, reqId);
  if (g >= 0) return owned.get(1000000 + g) ?? 0;
  return owned.get(reqId) ?? 0;
}

/** 单条配方当前可合成次数（HowManyTimesCanRecipeBeCrafted Recipe.cs:289-310）；
 *  返回 0 = 材料不足 */
export function craftableCount(r: VanillaRecipe, owned: Map<number, number>): number {
  let min = Infinity;
  for (const req of r.items) {
    const have = itemMatches(r, req.id, owned);
    if (have < req.stack) return 0;
    min = Math.min(min, Math.floor(have / req.stack));
  }
  return min === Infinity ? 0 : min;
}

/** 站点 TileID → 本仓库内部 tile id（TILE_BY_KEY 反查 v_<id>_ key 不稳定，按 vanilla.sheet 扫 TILE_DEFS） */
const SHEET_TO_INTERNAL = (() => {
  const m = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const sheet = TILE_DEFS[i]?.vanilla?.sheet;
    if (sheet !== undefined && !m.has(sheet)) m.set(sheet, i);
  }
  return m;
})();

export interface VanillaCraftCtx {
  /** 附近站点（内部 tile id 集合——Game.stationsNearby 扫描结果） */
  nearbyInternal: Set<number>;
  /** 附近有炼金台（tile 355/699 经继承算 tile 13；player.alchemyTable）——炼金配方材料 1/3 免费 */
  alchemyTable?: boolean;
  /** 附近液体：水/蜂蜜/岩浆源（adjWaterSource/adjHoney/adjLava） */
  nearWater?: boolean;
  nearHoney?: boolean;
  nearLava?: boolean;
  zoneSnow?: boolean;
  zoneGraveyard?: boolean;
}

/** 环境条件（PlayerMeetsEnvironmentConditions Recipe.cs:321-357） */
export function envOk(r: VanillaRecipe, ctx: VanillaCraftCtx): boolean {
  if (r.tile >= 0) {
    const expanded = expandStationTiles(r.tile);
    // 任一等价站点在附近（adjTile[requiredTile] + CountsAs 继承）
    const ok = expanded.some((t) => {
      const internal = SHEET_TO_INTERNAL.get(t);
      return internal !== undefined && ctx.nearbyInternal.has(internal);
    });
    if (!ok) return false;
  }
  if (r.water && !ctx.nearWater) return false;
  if (r.honey && !ctx.nearHoney) return false;
  if (r.lava && !ctx.nearLava) return false;
  if (r.snow && !ctx.zoneSnow) return false;
  if (r.graveyard && !ctx.zoneGraveyard) return false;
  return true;
}

/** 成品 → 本仓库 item key（vi_<id>_* 反查） */
const VID_TO_KEY = (() => {
  const m = new Map<number, string>();
  for (const def of ITEM_DEFS) {
    const vid = def.vid ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : -1);
    if (vid >= 0 && !m.has(vid)) m.set(vid, def.key);
  }
  return m;
})();

export function vanillaItemKey(vid: number): string | undefined {
  return VID_TO_KEY.get(vid);
}

/** 材料原版 id → 显示名用的本仓库 key（组内物品可能部分缺，取第一个存在的） */
export function ingredientKey(vid: number): string | undefined {
  if (vid >= 1000000) {
    const items = RECIPE_GROUP_ITEMS[String(vid - 1000000)];
    if (items) for (const it of items) {
      const k = VID_TO_KEY.get(it);
      if (k) return k;
    }
    return undefined;
  }
  return VID_TO_KEY.get(vid);
}

/** 计算可用配方索引列表（UpdateRecipeList 主干） */
export function availableRecipes(inv: Inventory, ctx: VanillaCraftCtx): Array<{ r: VanillaRecipe; count: number }> {
  const owned = collectOwnedItems(inv);
  const out: Array<{ r: VanillaRecipe; count: number }> = [];
  for (const r of VANILLA_RECIPES) {
    if (!envOk(r, ctx)) continue;
    const count = craftableCount(r, owned);
    if (count > 0) out.push({ r, count });
  }
  return out;
}

/** 执行合成（CraftingRequests.CraftLocally 主干）：扣材料→返成品 key（放置进背包由调用方） */
export function consumeMaterials(inv: Inventory, r: VanillaRecipe, times = 1, alchemyTable = false): boolean {
  for (const req of r.items) {
    let need = req.stack * times;
    // 炼金折扣（GetIngredientCraftingDiscount Recipe.cs:213-227：alchemy 配方且 alchemyTable
    // 时每个材料独立掷 1/3 概率该份免费——按"每份独立掷骰"逐个扣）
    if (r.alchemy && alchemyTable && times === 1) {
      let discounted = 0;
      for (let k = 0; k < need; k++) if (Math.random() < 1 / 3) discounted++;
      need -= discounted;
      if (need <= 0) continue;
    }
    // 组材料（groupOf:占位 id/哨兵 id 统一判定,ConsumeFromInventory :451 语义——
    // 组槽可扣组内任一成员,依序补足）
    const gid = groupOf(r, req.id);
    if (gid >= 0) {
      const items = RECIPE_GROUP_ITEMS[String(gid)] ?? [];
      for (const gid of items) {
        if (need <= 0) break;
        const key = VID_TO_KEY.get(gid);
        if (!key) continue;
        const internal = (Object as unknown as { _k?: never });
        void internal;
        // 直接经 ITEM_DEFS 反查内部 id 再 inv.remove
        const iid = invIndexOfVanilla(gid);
        if (iid < 0) continue;
        const have = inv.countOf(iid);
        const take = Math.min(have, need);
        if (take > 0) { inv.remove(iid, take); need -= take; }
      }
      if (need > 0) return false;
    } else {
      const iid = invIndexOfVanilla(req.id);
      if (iid < 0 || inv.countOf(iid) < need) return false;
      inv.remove(iid, need);
    }
  }
  return true;
}

/** 原版 item id → Inventory 内部 item id（缓存） */
const _iidCache = new Map<number, number>();
export function invIndexOfVanilla(vid: number): number {
  let hit = _iidCache.get(vid);
  if (hit !== undefined) return hit;
  const key = VID_TO_KEY.get(vid);
  // ITEM_DEFS 下标即内部 id——线性扫一次后缓存
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    const v = d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    if (v === vid) { hit = i; break; }
  }
  hit ??= -1;
  _iidCache.set(vid, hit);
  return hit;
}

/** 供合成 UI 判定"此物品是合成材料吗"（ItemID.Sets.IsAMaterial 近似：出现在任一配方材料中） */
export const MATERIAL_VIDS = (() => {
  const s = new Set<number>();
  for (const r of VANILLA_RECIPES) for (const req of r.items) s.add(req.id);
  return s;
})();

export type VanillaRecipeLike = VanillaRecipe;
export { itemCombat };
