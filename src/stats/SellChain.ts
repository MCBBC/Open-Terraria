// ============================================================================
// 卖出链 1:1（Terarria1456 反编译源码为唯一标杆，行号全程对照）
//   Player.SellItem               Player.cs:34716-34878   （卖价核心 + 入包回滚）
//   Player.GetItemExpectedPrice   Player.cs:34907-34946   （卖/买双价，快乐度+折扣卡）
//   Item.GetStoreValue            Item.cs:49492-49500     （shopCustomPrice ?? value）
//   Item.sellPrice                Item.cs:49019-49022     （×5 → 表值恒为 5 的倍数）
//   ItemShopSellbackHelper        ItemShopSellbackHelper.cs:10-64（店内回购记）
//   Main.UpdateOldNPCShop         Main.cs:18056-18064     （换店清回购记）
//   ItemSlot.GetSellOrTrash       ItemSlot.cs:185-196     （Shift+左键 Sell/垃圾桶/钱币豁免）
//   ItemSlot.OverrideLeftClick cursorOverride==10         ItemSlot.cs:780-798（出售结算）
//   ItemSlot.LeftClick case 4 / PickItemMovementAction 15 ItemSlot.cs:1110-1129/:1426-1439
//                                （光标持有物点空商店格 = 整叠卖出）
//   ItemSlot.HandleShopSlot       ItemSlot.cs:1870-1931   （买入：GetItemExpectedPrice
//                                →BuyItem；buyOnce 减库存；!buyOnce 才记回购）
//   Item.Prefix value 缩放        Item.cs:596-597         （num2*=num2 平方乘区）
//   Chest.AddItemToShop           Chest.cs:651-670        （卖出克隆回 buyOnce 货架）
//   Main.MouseText_DrawItemTooltip_AddShopLines Main.cs:20305-20345（tooltip 同公式）
//
// 本模块纯函数化：全部状态走入参（settings），不触 Game/World/存档。
// 物品 value 表 = vanilla-shopstock.json values（3138 条全量，tools/extract-shops.mjs
// 提取自 Item.cs SetDefaults 各 case 的 value= 字段；缺条目 = 原版未赋 value = 0，
// 见 Item.cs:1485-1489 case 9 木板无 value 行 → value 恒 0）。
// ============================================================================
import shopstockJson from '../data/vanilla-shopstock.json';
import { f32, roundCS } from './ScaleStats';
import { prefixValueMul } from '../data/vanillaPrefixes';

/** 物品 value 表（vanilla-shopstock.json 附带；Game.ts:268 ITEM_VALUES 同源，此处
 *  独立导入以保持纯函数无 Game 依赖） */
const ITEM_VALUES = (shopstockJson as { values: Record<string, number> }).values;

// ---------------------------------------------------------------------------
// Item.GetStoreValue（Item.cs:49492-49500）
//   ```csharp
//   public int GetStoreValue() {
//       if (shopCustomPrice.HasValue) return shopCustomPrice.Value;   // :49494-49497
//       return value;                                                  // :49499
//   }
//   ```
// shopCustomPrice 未实装（本仓无店主自定义价）→ 恒回落 item.value。
// 缺表条目（如 2 泥土/9 木板/3 手里剑）= 原版 value 0 = 不可卖。
// ---------------------------------------------------------------------------
export function itemStoreValue(vid: number): number {
  return ITEM_VALUES[String(vid)] ?? 0;
}

// ---------------------------------------------------------------------------
// Item.Prefix 的 value 缩放（Item.cs:596-597）——带词缀物品的 GetStoreValue：
//   :596  num2 *= num2;                          ← 词缀价值乘区【平方后再乘】
//   :597  value = (int)((float)value * num2);    ← (int) 向零截断
// num2 = TryGetPrefixStatMultipliersForItem 的 out value（Item.cs:1041 乘区公式，
// 本仓 prefixValueMul 同式、含配饰档位 :1043-1058）。卖价（GetStoreValue→
// calcForSelling）与买回价（buyOnce 分支）都以缩放后 value 计——白板物品恒走
// itemStoreValue 原值。
// ---------------------------------------------------------------------------
export function itemValueWithPrefix(vid: number, prefix = 0): number {
  const base = itemStoreValue(vid);
  if (!prefix) return base;
  const m = prefixValueMul(prefix);              // out value（未平方）
  const sq = f32(f32(m) * f32(m));               // :596 num2 *= num2（f32 逐位）
  return Math.trunc(f32(f32(base) * sq));        // :597 (int) 截断
}

/** 出售输入（对应 SellItem 处引用的原版字段） */
export interface SellSettings {
  /** Item.prefix——value 缩放（Item.cs:596-597 num2 平方乘区）；
   *  缺省 0 = 白板，走 itemStoreValue 原值 */
  prefix?: number;
  /** Player.currentShoppingSettings.PriceAdjustment（Player.cs:2780；NotInShop=1f，
   *  ShoppingSettings.cs:11-14）。Game 侧传 shopHappinessMul（开对话时快照） */
  priceAdjustment?: number;
  /** Player.discountAvailable（Player.cs:2502/:25353）——854 折扣卡/3035 贪婪戒指
   *  （Player.cs:14424/:14446；本仓 equipStats.discount 同源） */
  discountAvailable?: boolean;
  /** Main.shopSellbackHelper.GetAmount(item)（Player.cs:34739；本次开店会话内从该店
   *  购入的同 type+prefix 数量，ItemShopSellbackHelper.cs:45-52） */
  sellbackAmount?: number;
  /** Item.isAShopItem（Item.cs:114；Chest.SetupShop 收尾对全部在售条目置位
   *  Chest.cs:3519-3522）。卖出路径恒 false：买入走 SetDefaults 重置（ItemSlot.cs:1912）
   *  → 玩家包内物品不是商店条目实例 */
  isAShopItem?: boolean;
  /** Item.buyOnce（Item.cs:240；仅 Chest.AddItemToShop 对卖回店的克隆置位
   *  Chest.cs:660-671）。卖出路径恒 false */
  buyOnce?: boolean;
}

/** GetItemExpectedPrice 输出（Player.cs:34907 出参 calcForSelling/calcForBuying） */
export interface ExpectedPrices {
  /** calcForSelling：单件卖价基数（再 ÷5 才是每件铜币） */
  selling: number;
  /** calcForBuying：单件买价基数（回购记退款额用） */
  buying: number;
  /** GetStoreValue 原值（:34914） */
  storeValue: number;
}

// ---------------------------------------------------------------------------
// Player.GetItemExpectedPrice（Player.cs:34907-34946）逐行对照
//   shopSpecialCurrency 分支（:34909-34913）走 CustomCurrencyManager——本仓无自定义
//   币种商店，登记不实装，直接进铜币主链。
// ---------------------------------------------------------------------------
export function expectedPrices(storeValue: number, s: SellSettings = {}): ExpectedPrices {
  const pa = s.priceAdjustment ?? 1;              // NotInShop = 1f（ShoppingSettings.cs:11-14）
  let selling = storeValue;                        // :34915 calcForSelling = storeValue
  let buying = storeValue;                         // :34916 calcForBuying  = storeValue
  if (s.discountAvailable) {                       // :34917
    if (!s.buyOnce) {
      // :34921 calcForBuying = (int)((float)calcForBuying * 0.8f)
      // (int) 强转 = 向零截断；float 乘法以 f32 逐位对齐
      buying = Math.trunc(f32(f32(buying) * f32(0.8)));
    }
    if (s.isAShopItem) selling = buying;           // :34923-34926
  }
  if (s.buyOnce) {
    // :34930-34931 (int)Math.Round((float)x / PriceAdjustment)
    // Math.Round(double) 默认银行家舍入（.5 → 就近偶数）→ roundCS
    buying = roundCS(f32(f32(buying) / f32(pa)));
    selling = roundCS(f32(f32(selling) / f32(pa)));
  } else {
    buying = roundCS(f32(f32(buying) * f32(pa)));  // :34935
    selling = roundCS(f32(f32(selling) / f32(pa))); // :34936 快乐度作用于卖价（÷ 而非 ×）
  }
  if (s.buyOnce) {
    buying = Math.floor(buying / 5);               // :34940 calcForBuying /= 5L（long 除 = 取整）
    if (storeValue !== 0 && buying < 1) buying = 1; // :34941-34944
  }
  return { selling, buying, storeValue };
}

/** 出售结算（SellItem 价格段 Player.cs:34716-34743 的纯函数投影） */
export interface SellQuote {
  /** SellItem :34719-34722 calcForSelling<=0 → return false（不可卖） */
  sellable: boolean;
  /** 商店应付总额（铜币；SellItem :34738 num = perUnit*stack + 回购差额 :34742） */
  copper: number;
  /** 每件铜币（:34732-34736 ÷5 取整 + 最小 1 兜底） */
  perUnit: number;
  /** GetItemExpectedPrice 双价（调试/断言用） */
  prices: ExpectedPrices;
}

// ---------------------------------------------------------------------------
// Player.SellItem（Player.cs:34716-34878）价格段 1:1：
//   :34718  GetItemExpectedPrice(item, out calcForSelling, out calcForBuying)
//   :34719  if (calcForSelling <= 0) return false;          ← 不可卖清单（value=0 族）
//   :34732  long num = calcForSelling / 5;                  ← 卖价 = 价值/5
//   :34733  if (num < 1) num = 1L;                          ← 每件最小 1 铜
//   :34737  long num2 = num;
//   :34738  num *= stack;                                   ← 堆叠按 stack 相加
//   :34739  amount = Main.shopSellbackHelper.GetAmount(item);
//   :34740  if (amount > 0)
//   :34742      num += (-num2 + calcForBuying) * Math.Min(amount, item.stack);
//           ← 店内刚买的按【买价】原额退（差额补齐），仅覆盖记账数量
//   :34745-34868 币面额换装入包（74 铂/73 金/72 银/71 铜）→ Game.gainCopper 消费
//   :34869-34876 装不下 → 全量回滚 → Game.npcShopSell 消费
// ---------------------------------------------------------------------------
export function computeSellValue(vid: number, stack: number, settings: SellSettings = {}): SellQuote {
  const prices = expectedPrices(itemValueWithPrefix(vid, settings.prefix ?? 0), settings);
  if (prices.selling <= 0) {                       // :34719-34722
    return { sellable: false, copper: 0, perUnit: 0, prices };
  }
  let perUnit = Math.floor(prices.selling / 5);    // :34732 long 除 = 向下取整（非负）
  if (perUnit < 1) perUnit = 1;                    // :34733-34736
  let total = perUnit * stack;                     // :34737-34738
  const amount = settings.sellbackAmount ?? 0;     // :34739
  if (amount > 0) {                                // :34740
    total += (prices.buying - perUnit) * Math.min(amount, stack); // :34742
  }
  return { sellable: true, copper: total, perUnit, prices };
}

// ---------------------------------------------------------------------------
// ItemSlot.GetSellOrTrash（ItemSlot.cs:185-196）——Shift+左键动作选路：
//   :187  if (Main.npcShop <= 0) return Trash;      ← 店外 = 垃圾桶
//   :191  if (item.type >= 71 && item.type <= 74) return null;  ← 钱币不卖（不动作）
//   :195  return Sell;                              ← 店内非钱币 = 卖出
// Game/UI 的门禁消费此函数（钱币不进卖出，也不回落垃圾桶）。
// ---------------------------------------------------------------------------
export function canSellFromShopUi(vid: number): boolean {
  return !(vid >= 71 && vid <= 74);
}

// ---------------------------------------------------------------------------
// Chest.AddItemToShop（Chest.cs:651-670）残量纯函数——卖出物品回 buyOnce 货架：
//   :652  num = shopSellbackHelper.Remove(newItem)
//         ← 实扣量 = min(记账量, newItem.stack)（ItemShopSellbackHelper.cs:52-63：
//           记少扣到 0 删键返回记账量 / 记多扣 item.stack）
//   :653-656  if (num >= newItem.stack) return;   ← 记账全覆盖 → 不上架
//   :658-663  item[i] = newItem.Clone()（buyOnce=true、favorited=false、
//             stack -= num）落 item[0-39] 首空位
// 返回应上架残量（0 = 不上架）。
// ---------------------------------------------------------------------------
export function buybackShelfStack(stack: number, memoBefore: number): number {
  const covered = Math.min(memoBefore, stack);   // Remove 实扣量（:652）
  if (covered >= stack) return 0;                // :653-656 全覆盖不上架
  return stack - covered;                        // :663 stack -= num
}
