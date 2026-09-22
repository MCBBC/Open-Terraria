// 护卫勋章自定义币种（CustomCurrencyID.DefenderMedals 全链 1:1）：
//   CustomCurrencyManager.Initialize    CustomCurrencyManager.cs:14-18
//     （RegisterCurrency(new CustomCurrencySingleCoin(3817, 999L)) → id 0）
//   CustomCurrencySystem.CountCurrency  CustomCurrencySystem.cs:26-47
//     （_valuePerUnit[3817]=1，累计 ≥ CurrencyCap 999 截断）
//   Player.BuyItem(price, customCurrency) Player.cs:34948-34951
//     → CustomCurrencyManager.BuyItem    CustomCurrencyManager.cs:70-121
//     （先 CountCurrency 各仓合计 < price 拒付；再 TryPurchasing 逐槽扣减；
//      ★SW-FX17 计数/扣款域=五仓：inventory + bank/bank2/bank3/bank4（:76-87 计数段、
//      :89-121 扣款段）——勋章可存入随身四银行（虚空袋对 3817 无拒收门,
//      CanVoidVaultAccept :39733-39745 只拒 questItem∪3822）,勋章买价直比合计）
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
// ★SW-FX17（2026-09-10）撤账+补刀：旧登记「本仓无账本系统，仅扫背包 0-49」前提已
// 失实——bank×4 随身银行（piggy/safe/forge/void vault，banks[0..3]）在库
// （tests/bank-storage.test.ts），勋章可存入四银行 ⇒ 消费/显示两面的取数域
// 与原版对齐为五仓。舱位忽略面 = inventory 段 ignoreSlots{58,57,56,55,54}
// （CustomCurrencyManager.cs:79——4 弹药格+58 光标镜像槽；本仓 trash 独立字段、
// 弹药=slots[54-57] ⇒ 等价面 = 段内 i≥54 跳过）。储蓄显示面（DrawSavings :28-63）
// 仍【只】合计四仓（不含背包）——两域分立两函数。
import { ITEM_DEFS } from '../data/items';
import type { InvItem } from '../items/Inventory';


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
    if (s && (ITEM_DEFS[s.id]?.vid ?? -1) === DEFENDER_MEDAL_ITEM_ID) n += s.stack;
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
    if (!s || (ITEM_DEFS[s.id]?.vid ?? -1) !== DEFENDER_MEDAL_ITEM_ID) continue;
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

// ---------------------------------------------------------------------------
// ★SW-FX17 五仓域（CustomCurrencyManager.BuyItem CustomCurrencyManager.cs:70-121；
//   1458 该文件逐字节同源——diff 实证）
// ---------------------------------------------------------------------------

/** 五仓池形（本仓 bank×4 = p.banks[0..3]，inventory = p.inv.slots 58 槽） */
export interface MedalPools {
  /** player.inventory 等价段——段内 i≥54 跳过（原文 ignoreSlots{58,57,56,55,54}：
   *  4 弹药格 + 58 光标镜像；本仓 trash 独立字段天然不在段内） */
  inventory: ReadonlyArray<InvItem | null>;
  /** bank/bank2/bank3/bank4（piggy 87/safe 346/forge 3813/void vault 4076，
   *  各 40 槽全段扫描——bank4 无 useVoidBag 前置门 :82） */
  banks: ReadonlyArray<ReadonlyArray<InvItem | null>>;
}

/** 单段 CountCurrency（CustomCurrencySystem.cs:26-47，cap 999）+ 忽略位过滤 */
function countSegment(slots: ReadonlyArray<InvItem | null>, skipFrom: number): number {
  let n = 0;
  for (let i = 0; i < slots.length; i++) {
    if (i >= skipFrom) break;
    const s = slots[i];
    if (s && (ITEM_DEFS[s.id]?.vid ?? -1) === DEFENDER_MEDAL_ITEM_ID) n += s.stack;
    if (n >= DEFENDER_MEDAL_CAP) return DEFENDER_MEDAL_CAP;
  }
  return n;
}

/** BuyItem 门口计数（CustomCurrencyManager.cs:76-87）：五段各 CountCurrency（各 cap
 *  999）→ CombineStacks 合计（再 cap 999）。消费门/支付能力统一取数口。 */
export function countDefenderMedalsAcross(pools: MedalPools): number {
  let total = countSegment(pools.inventory, 54);
  if (total >= DEFENDER_MEDAL_CAP) return DEFENDER_MEDAL_CAP;
  for (const bank of pools.banks) {
    total += countSegment(bank, Number.MAX_SAFE_INTEGER);
    if (total >= DEFENDER_MEDAL_CAP) return DEFENDER_MEDAL_CAP;
  }
  return total;
}

/** TryPurchasing 五仓扣款（CustomCurrencyManager.cs:88-121 + CustomCurrencySingleCoin
 *  .cs:26-74）：扣序 = slotCoins 构造序 = inventory[0..53] 升序 → bank → bank2 →
 *  bank3 → bank4 各段槽序升序；每槽扣 min(stack, 余款)，空格不跳过（无勋章格自然
 *  滑过）；余款未尽【全量回滚】返回 false（:68-72 ItemCacheRestore）。原位变更。 */
export function spendDefenderMedalsAcross(
  pools: MedalPools, price: number,
): boolean {
  const order: Array<{ slots: Array<InvItem | null>; from: number }> = [
    { slots: pools.inventory as Array<InvItem | null>, from: 54 },
    ...pools.banks.map((b) => ({ slots: b as Array<InvItem | null>, from: Number.MAX_SAFE_INTEGER })),
  ];
  let remain = price;
  const touched: Array<[Array<InvItem | null>, number, InvItem | null]> = [];   // ItemCache 等价
  for (const { slots, from } of order) {
    for (let i = 0; i < slots.length && i < from && remain > 0; i++) {
      const s = slots[i];
      if (!s || (ITEM_DEFS[s.id]?.vid ?? -1) !== DEFENDER_MEDAL_ITEM_ID) continue;
      touched.push([slots, i, { ...s }]);
      const take = Math.min(s.stack, remain);
      s.stack -= take;
      remain -= take;
      if (s.stack <= 0) slots[i] = null;   // :40-59 stack==0 → 清空（SetDefaults(0) 面等价）
    }
  }
  if (remain > 0) {
    for (const [slots, i, snap] of touched) slots[i] = snap;   // 全量回滚
    return false;
  }
  return true;
}

/** 储蓄显示面（CustomCurrencyManager.DrawSavings CustomCurrencyManager.cs:28-40）：
 *  【只】合计 bank..bank4 四仓（不含背包——背包勋章不进储蓄计数），CombineStacks
 *  cap 999。原版 num5>0 才画（:40）；本仓商店头部常显域由调用方决策（登记）。 */
export function defenderMedalSavingsOf(banks: ReadonlyArray<ReadonlyArray<InvItem | null>>): number {
  let total = 0;
  for (const bank of banks) {
    total += countSegment(bank, Number.MAX_SAFE_INTEGER);
    if (total >= DEFENDER_MEDAL_CAP) return DEFENDER_MEDAL_CAP;
  }
  return total;
}
