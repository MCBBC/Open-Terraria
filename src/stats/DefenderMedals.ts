// 护卫勋章自定义币种（CustomCurrencyID.DefenderMedals 全链 1:1）：
//   CustomCurrencyManager.Initialize    CustomCurrencyManager.cs:14-18
//     （RegisterCurrency(new CustomCurrencySingleCoin(3817, 999L)) → id 0）
//   CustomCurrencySystem.CountCurrency  CustomCurrencySystem.cs:26-47
//     （_valuePerUnit[3817]=1，累计 ≥ CurrencyCap 999 截断）
//   Player.BuyItem(price, customCurrency) Player.cs:34948-34951
//     → CustomCurrencyManager.BuyItem    CustomCurrencyManager.cs:70-121
//     （先 CountCurrency 各仓合计 < price 拒付；再 TryPurchasing 逐槽扣减）
//   CustomCurrencySingleCoin.TryPurchasing CustomCurrencySingleCoin.cs:26-74
//     （槽序贪心：每槽扣 min(stack, 余款)，清空置 null；不足理论不可达——
//      门口 CountCurrency 已保证——仍走满回滚返回 false）
//   CustomCurrencySystem.GetItemExpectedPrice CustomCurrencySystem.cs:266-271
//     （shopSpecialCurrency 条目的买/卖双价 = GetStoreValue() 原值：无折扣卡
//      ×0.8、无快乐度 PriceAdjustment 乘区——Player.cs:34909-34913 直转不走主链）
//   Item.GetStoreValue              Item.cs:49492-49500（shopCustomPrice ?? value）
//   价格文案 GetPriceText           CustomCurrencySingleCoin.cs:103-107
//     （Lang.tip[50] + price + Language[Currency.DefenderMedals].ToLower()，
//      文字色 CurrencyTextColor = (240,100,120)）
// 勋章本体 3817：Item.cs value=0（case 3817 `value = 0;`）——不可卖出；不设
// consumable（货币语义，非消耗品）。掉落源 = 旧日军团（OldOnesArmy 按 T1/T2/T3
// 3/15/60 枚，DD2Event.cs 结算段，Game 侧已接 dropAtCrystal）。
// 仓覆盖差异登记：原版 CountCurrency 扫 inventory（忽略 54-57 弹药格）+ 猪牛
// 账本四仓（bank/bank2/bank3/bank4）——本仓无账本系统，仅扫背包 0-49；勋章非
// 弹药/钱币（ammoSlotAccepts/coinSlotAccepts 均拒），弹药格忽略门不可达，等价。
import type { InvItem } from '../items/Inventory';
import { vanillaIdOfItem } from './Shimmer';

/** 勋章物品 id（ItemID.DefenderMedal，ItemID.cs:11712） */
export const DEFENDER_MEDAL_ITEM_ID = 3817;
/** CurrencyCap（CustomCurrencySingleCoin(3817, 999L)，CustomCurrencyManager.cs:17） */
export const DEFENDER_MEDAL_CAP = 999;

/** CountCurrency + CombineStacks（CustomCurrencySystem.cs:26-63）：勋章合计，
 *  ≥999 截断（overFlowing 语义：按 cap 计价） */
export function countDefenderMedals(slots: ReadonlyArray<InvItem | null>): number {
  let n = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s && vanillaIdOfItem(s.id) === DEFENDER_MEDAL_ITEM_ID) n += s.stack;
    if (n >= DEFENDER_MEDAL_CAP) return DEFENDER_MEDAL_CAP;
  }
  return n;
}

/** CustomCurrencySingleCoin.TryPurchasing（:26-74）：槽序贪心扣勋章；
 *  余款未尽【全量回滚】返回 null（:68-72 ItemCacheRestore——门口 CountCurrency
 *  校验后理论不可达，防御支同语义）；成功返回扣减后的槽位数组【原位变更】。 */
export function spendDefenderMedals(
  slots: Array<InvItem | null>, price: number,
): Array<InvItem | null> | null {
  let remain = price;
  const touched: Array<[number, InvItem | null]> = [];   // ItemCacheCreate/Restore 等价
  for (let i = 0; i < slots.length && remain > 0; i++) {
    const s = slots[i];
    if (!s || vanillaIdOfItem(s.id) !== DEFENDER_MEDAL_ITEM_ID) continue;
    touched.push([i, { ...s }]);
    const take = Math.min(s.stack, remain);
    s.stack -= take;
    remain -= take;
    if (s.stack <= 0) slots[i] = null;   // :40-59 stack==0 → SetDefaults(0) 置空
  }
  if (remain > 0) {
    for (const [i, snap] of touched) slots[i] = snap;
    return null;
  }
  return slots;
}

/** CustomCurrencySystem.GetItemExpectedPrice（:266-271）：勋章条目买价 =
 *  GetStoreValue() = shopCustomPrice ?? value。无折扣/快乐度乘区、无 min-1。 */
export function medalShopPrice(shopCustomPrice: number | undefined, itemValue: number): number {
  return shopCustomPrice ?? itemValue;
}

/** GetPriceText 文案（CustomCurrencySingleCoin.cs:103-107，色 (240,100,120)） */
export const DEFENDER_MEDAL_TEXT_COLOR = 'rgb(240,100,120)';
