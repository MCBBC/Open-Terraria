// mod 商店上架(2026-10-04 P3):content/shops.json → 按 NPC id 的追加货架。
// 消费缝=Game.npcShopStock 的 `return out`(原版 adjust 之后追加,remix 抑制门/
// cond 过滤只作用于原版段——mod 货恒上架)。物品 id 域=内部 id(≡mod stable id)。
interface ModShopEntry { id: number; price: number; requireFlags?: string[] }
const modShopStock = new Map<string, ModShopEntry[]>();

/** register 相期登记:per NPC 追加货架(★三百十八:条目加 requireFlags 条件门) */
export function registerModShopStock(npcId: number, entries: Array<[number, number] | { id: number; price: number; requireFlags?: string[] }>): void {
  const list = modShopStock.get(String(npcId)) ?? [];
  for (const e of entries) {
    if (Array.isArray(e)) list.push({ id: e[0], price: e[1] });
    else list.push(e);
  }
  modShopStock.set(String(npcId), list);
}

/** Game 商店货架缝:该 NPC 的 mod 追加货(无=空数组,零成本)。
 *  ★三百十八:flags 条件过滤(requireFlags 全须=上架;缺省=恒上架) */
export function modShopStockOf(npcId: number, flags?: Record<string, boolean>): Array<[number, number]> {
  const list = modShopStock.get(String(npcId)) ?? [];
  const out: Array<[number, number]> = [];
  for (const e of list) {
    if (e.requireFlags?.length && flags && !e.requireFlags.every((f) => flags[f])) continue;
    out.push([e.id, e.price]);
  }
  return out;
}

export function _resetModShopsForTests(): void {
  modShopStock.clear();
}
