// 卖出链测试（Player.SellItem Player.cs:34716-34878 /
//   Player.GetItemExpectedPrice Player.cs:34907-34946 / ItemSlot.GetSellOrTrash
//   ItemSlot.cs:185-196）。纯函数：不建 Game/World/存档。
//   物品 value 权威 = vanilla-shopstock.json values（提取自 Item.cs SetDefaults），
//   抽查项对照反编译源码行号：39→100（Item.cs:1824 value=100）、23→5（:1640）、
//   71→5/72→500/73→50000/74→5000000（:2204/:2225/:2246/:2267）。
import { describe, it, expect } from 'vitest';
import { computeSellValue, expectedPrices, itemStoreValue, canSellFromShopUi, itemValueWithPrefix, buybackShelfStack } from '../src/stats/SellChain';

describe('卖出链 Player.SellItem 1:1', () => {
  it('基础卖价 = value ÷ 5（Player.cs:34732）：39 号（value=100）单件卖 20 铜', () => {
    const q = computeSellValue(39, 1);
    expect(q.sellable).toBe(true);
    expect(q.perUnit).toBe(20);
    expect(q.copper).toBe(20);
  });

  it('堆叠按 stack 相加（:34737-34738 num *= stack）：39 号 ×50 = 1000 铜', () => {
    const q = computeSellValue(39, 50);
    expect(q.perUnit).toBe(20);
    expect(q.copper).toBe(1000);
  });

  it('每件最小 1 铜兜底（:34733-34736）：凝胶 23（value=5）× 快乐度 1.5 → 每件 1 铜 ×10 = 10', () => {
    // selling = round(5/1.5) = 3 → 3/5 = 0 → 夹到 1（:34733-34736）
    const q = computeSellValue(23, 10, { priceAdjustment: 1.5 });
    expect(q.prices.selling).toBe(3);
    expect(q.perUnit).toBe(1);
    expect(q.copper).toBe(10);
  });

  it('不可卖清单 = value 0 族（:34719-34722 calcForSelling<=0 → false）：泥土 2 / 木板 9 / 手里剑 3 表外即 value 0', () => {
    for (const vid of [2, 9, 3]) {
      expect(itemStoreValue(vid)).toBe(0);
      expect(computeSellValue(vid, 99).sellable).toBe(false);
      expect(computeSellValue(vid, 99).copper).toBe(0);
    }
  });

  it('钱币不进卖出动作（GetSellOrTrash :191-194 type 71-74 → null）：71-74 拒绝，70/75 放行', () => {
    for (const vid of [71, 72, 73, 74]) expect(canSellFromShopUi(vid)).toBe(false);
    for (const vid of [70, 75]) expect(canSellFromShopUi(vid)).toBe(true);
  });

  it('钱币面值表（Item.cs:2204/:2225/:2246/:2267）：铜 5 银 500 金 50000 铂 5000000', () => {
    expect(itemStoreValue(71)).toBe(5);
    expect(itemStoreValue(72)).toBe(500);
    expect(itemStoreValue(73)).toBe(50000);
    expect(itemStoreValue(74)).toBe(5000000);
  });

  it('快乐度作用于卖价且方向为 ÷（:34936）：0.88 → 22 铜 / 1.12 → 17 铜（比 1.0 的 20 更贵/更贱）', () => {
    // selling = round(100/0.88) = 114 → 114/5 = 22（快乐 NPC 收购更慷慨）
    expect(computeSellValue(39, 1, { priceAdjustment: 0.88 }).copper).toBe(22);
    // selling = round(100/1.12) = 89 → 89/5 = 17（不快乐 NPC 压价收购）
    expect(computeSellValue(39, 1, { priceAdjustment: 1.12 }).copper).toBe(17);
  });

  it('买价同快乐度但方向为 ×（:34935）：0.88 → 买 88 / 1.12 → 买 112（双向不对称）', () => {
    expect(expectedPrices(100, { priceAdjustment: 0.88 }).buying).toBe(88);
    expect(expectedPrices(100, { priceAdjustment: 1.12 }).buying).toBe(112);
  });

  it('折扣卡不改变普通物品卖价（:34919-34922 只改 calcForBuying，isAShopItem=false）：仍 20 铜', () => {
    const p = expectedPrices(100, { discountAvailable: true });
    expect(p.buying).toBe(80);
    expect(p.selling).toBe(100);
    expect(computeSellValue(39, 1, { discountAvailable: true }).copper).toBe(20);
  });

  it('折扣卡 × 商店条目（:34923-34926 calcForSelling = calcForBuying）：卖价吃 0.8 → 16 铜', () => {
    const p = expectedPrices(100, { discountAvailable: true, isAShopItem: true });
    expect(p.selling).toBe(80);
    expect(computeSellValue(39, 1, { discountAvailable: true, isAShopItem: true }).copper).toBe(16);
  });

  it('折扣卡 ×0.8 是 (int) 截断不是四舍五入（:34921）：101×0.8 = 80.8 → 80', () => {
    expect(expectedPrices(101, { discountAvailable: true }).buying).toBe(80);
  });

  it('Math.Round 为银行家舍入（:34930-34936 .5 → 就近偶数）：17÷2 = 8.5 → 8（Math.round 会给 9）', () => {
    expect(expectedPrices(17, { priceAdjustment: 2 }).selling).toBe(8);
    expect(Math.round(17 / 2)).toBe(9);   // 对照组：确认本例确实卡在 .5
  });

  it('店内回购记：全额按买价退（:34739-34743）：买了 1 件 39 号原价 100，当场卖回 = 100 铜', () => {
    const q = computeSellValue(39, 1, { sellbackAmount: 1 });
    expect(q.copper).toBe(20 + (100 - 20) * 1);
    expect(q.copper).toBe(100);
  });

  it('回购记只覆盖记账数量（:34742 Math.Min(amount, item.stack)）：卖 3 件记 1 件 = 140 铜', () => {
    // 20×3 + (100-20)×min(1,3) = 60 + 80 = 140
    expect(computeSellValue(39, 3, { sellbackAmount: 1 }).copper).toBe(140);
  });

  it('回购记 + 折扣卡 + 快乐度：退的是实付买价（calcForBuying 链 0.8→×1.06=85）= 85 铜', () => {
    // selling = round(100/1.06) = 94 → 94/5 = 18；buying = round(80×1.06) = 85
    // 18 + (85-18)×1 = 85 = 玩家当时实付
    const q = computeSellValue(39, 1, {
      discountAvailable: true, priceAdjustment: 1.06, sellbackAmount: 1,
    });
    expect(q.prices.buying).toBe(85);
    expect(q.copper).toBe(85);
  });

  it('buyOnce 分支全链（:34928-34945 除法调价 + :34940 买价再 ÷5 下限 1）', () => {
    // selling = round(100/1.06) = 94 → 每件 18；buying = round(100/1.06)=94 → ÷5 = 18
    const p = expectedPrices(100, { buyOnce: true, priceAdjustment: 1.06 });
    expect(p.selling).toBe(94);
    expect(p.buying).toBe(18);
    expect(computeSellValue(39, 1, { buyOnce: true, priceAdjustment: 1.06 }).copper).toBe(18);
  });

  it('纯函数边界：settings 全缺省 = NotInShop（ShoppingSettings.cs:11-14 PriceAdjustment=1）；同参同果', () => {
    const a = computeSellValue(39, 7);
    const b = computeSellValue(39, 7);
    expect(a).toEqual(b);
    expect(a.copper).toBe(140);                            // 20×7，快乐度缺省 1
  });

  it('纯函数边界：settings 对象不被就地改写（无共享可变状态，存档/会话无关）', () => {
    const s = { priceAdjustment: 1.12, discountAvailable: true, sellbackAmount: 2 };
    const snapshot = { ...s };
    computeSellValue(39, 5, s);
    expect(s).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// 收尾批（2026-08-14）：买入侧截断链去近似（Player.GetItemExpectedPrice
// buying 分支）/ 词缀 value 缩放（Item.Prefix）/ 光标持有出售（ItemSlot.LeftClick
// case 4）/ 卖出回 buyOnce 货架（Chest.AddItemToShop）。
// ---------------------------------------------------------------------------
describe('买入侧价格链 1:1（Player.cs:34916-34935）', () => {
  it('折扣 (int) 截断先于快乐度乘区（:34921→:34935 顺序）：101 价折扣+1.5 → 80×1.5=120（旧近似 round(101×0.8×1.5)=121 会多收 1 铜）', () => {
    // :34921 (int)(101 × 0.8f) = (int)80.8000012 = 80；:34935 round(80 × 1.5f) = 120
    expect(expectedPrices(101, { discountAvailable: true, priceAdjustment: 1.5 }).buying).toBe(120);
    expect(Math.max(1, Math.round(101 * 0.8 * 1.5))).toBe(121);  // 对照组：旧近似确实错
  });

  it('买价 ×PriceAdjustment 银行家舍入（:34935 Math.Round）：15×1.5 = 22.5 → 22（Math.round 给 23）', () => {
    expect(expectedPrices(15, { priceAdjustment: 1.5 }).buying).toBe(22);
    expect(Math.round(15 * 1.5)).toBe(23);
  });

  it('买价无 min-1 钳制：折扣把 1 价砍到 (int)0.8→0 → 实收 0（min1 只在显示侧 Main.cs:20341-20343 与 buyOnce :34941-34944）', () => {
    expect(expectedPrices(1, { discountAvailable: true }).buying).toBe(0);
  });

  it('buyOnce 买回价不吃折扣（:34919-34921 门要求 !buyOnce）：100 价 1.5 快乐度 → round(100/1.5)=67 → ÷5 = 13', () => {
    const p = expectedPrices(100, { buyOnce: true, priceAdjustment: 1.5, discountAvailable: true });
    expect(p.buying).toBe(13);   // 67/5 = 13.4 → floor 13
  });
});

describe('词缀 value 缩放（Item.cs:596-597 num2 *= num2 平方乘区）', () => {
  it('白板（prefix 0）恒走原值：39 号 = 100', () => {
    expect(itemValueWithPrefix(39, 0)).toBe(100);
    expect(itemValueWithPrefix(39)).toBe(100);
  });

  it('83 号词缀（dmg1.15/kb1.15/spd0.9/mcst0.9/crt5）：乘区 1.7602…平方 3.098…×100 → (int) = 309', () => {
    expect(itemValueWithPrefix(39, 83)).toBe(309);
  });

  it('value 0 族缩放后仍 0：泥土 2 号带词缀照旧不可卖', () => {
    expect(itemValueWithPrefix(2, 83)).toBe(0);
    expect(computeSellValue(2, 1, { prefix: 83 }).sellable).toBe(false);
  });

  it('词缀卖价走缩放值（GetStoreValue=缩放后 value）：39 号×83 词缀单件 = floor(309/5) = 61 铜', () => {
    expect(computeSellValue(39, 1, { prefix: 83 }).perUnit).toBe(61);
  });
});

describe('光标持有物出售（ItemSlot.LeftClick case 4 :1110-1129 / PickItemMovementAction case 15 :1426-1439）', () => {
  it('钱币 71-74 持有点空商店格不动作（:1435 门）：canSellFromShopUi 全拒', () => {
    for (const vid of [71, 72, 73, 74]) expect(canSellFromShopUi(vid)).toBe(false);
  });

  it('整叠结算与格内同链：39 号持 7 件、回购记 2 件 = 20×7 + (100-20)×2 = 300 铜', () => {
    expect(computeSellValue(39, 7, { sellbackAmount: 2 }).copper).toBe(300);
  });

  it('value 0 持有物 = 白送入店分支（:1120-1126 SellItem false && value==0）', () => {
    const q = computeSellValue(9, 3);   // 木板 value 0
    expect(q.sellable).toBe(false);
    expect(q.copper).toBe(0);
  });
});

describe('卖出回 buyOnce 货架（Chest.AddItemToShop Chest.cs:651-670）', () => {
  it('记账全覆盖不上架（:653-656 num >= stack → return）', () => {
    expect(buybackShelfStack(5, 5)).toBe(0);
    expect(buybackShelfStack(5, 9)).toBe(0);   // 记 9 卖 5：实扣 min(9,5)=5 全覆盖
  });

  it('残量上架 stack-num（:663）：记 2 卖 5 → 上架 3；零记账卖 5 → 上架 5', () => {
    expect(buybackShelfStack(5, 2)).toBe(3);
    expect(buybackShelfStack(5, 0)).toBe(5);
  });

  it('买回再上架的对称价：value 100 白板卖 61 价词缀 83 → 回架价 = buyOnce(309) ÷5 = 61', () => {
    // 卖出得 floor(309/5)=61/件；回架买回价 round(309/1)/5 = 61 —— 原价买回
    expect(expectedPrices(itemValueWithPrefix(39, 83), { buyOnce: true }).buying).toBe(61);
  });
});
