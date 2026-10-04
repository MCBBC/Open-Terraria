// mod 商店上架(2026-10-04 P3):content/shops.json → 按 NPC id 的追加货架。
// 消费缝=Game.npcShopStock 的 `return out`(原版 adjust 之后追加,remix 抑制门/
// cond 过滤只作用于原版段——mod 货恒上架)。物品 id 域=内部 id(≡mod stable id)。
const modShopStock = new Map<string, Array<[number, number]>>();

/** register 相期登记:per NPC 追加 [itemInternalId, price] 货架 */
export function registerModShopStock(npcId: number, entries: Array<[number, number]>): void {
  const list = modShopStock.get(String(npcId)) ?? [];
  list.push(...entries);
  modShopStock.set(String(npcId), list);
}

/** Game 商店货架缝:该 NPC 的 mod 追加货(无=空数组,零成本) */
export function modShopStockOf(npcId: number): Array<[number, number]> {
  return modShopStock.get(String(npcId)) ?? [];
}

export function _resetModShopsForTests(): void {
  modShopStock.clear();
}
