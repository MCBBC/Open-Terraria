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
//   Main.MouseText_DrawItemTooltip_AddShopLines Main.cs:20305-20345（tooltip 同公式）
//
// 本模块纯函数化：全部状态走入参（settings），不触 Game/World/存档。
// 物品 value 表 = vanilla-shopstock.json values（3138 条全量，tools/extract-shops.mjs
// 提取自 Item.cs SetDefaults 各 case 的 value= 字段；缺条目 = 原版未赋 value = 0，
// 见 Item.cs:1485-1489 case 9 木板无 value 行 → value 恒 0）。
// ============================================================================
import shopstockJson from '../data/vanilla-shopstock.json';
import { f32, roundCS } from './ScaleStats';

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

/** 出售输入（对应 SellItem 处引用的原版字段） */
export interface SellSettings {
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
  const prices = expectedPrices(itemStoreValue(vid), settings);
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
