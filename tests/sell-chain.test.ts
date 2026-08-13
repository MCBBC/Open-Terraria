// 卖出链测试（Player.SellItem Player.cs:34716-34878 /
//   Player.GetItemExpectedPrice Player.cs:34907-34946 / ItemSlot.GetSellOrTrash
//   ItemSlot.cs:185-196）。纯函数：不建 Game/World/存档。
//   物品 value 权威 = vanilla-shopstock.json values（提取自 Item.cs SetDefaults），
//   抽查项对照反编译源码行号：39→100（Item.cs:1824 value=100）、23→5（:1640）、
//   71→5/72→500/73→50000/74→5000000（:2204/:2225/:2246/:2267）。
import { describe, it, expect } from 'vitest';
import { computeSellValue, expectedPrices, itemStoreValue, canSellFromShopUi } from '../src/stats/SellChain';

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
