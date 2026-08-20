// 商店自定义币种 + shopCustomPrice 数据链测试（M1 勋章店）：
//   CustomCurrencyManager/CustomCurrencySingleCoin（CustomCurrencyManager.cs:14-18/
//   CustomCurrencySingleCoin.cs:26-74/CustomCurrencySystem.cs:26-63/:266-271）
//   Item.GetStoreValue（Item.cs:49492-49500 shopCustomPrice ?? value）
//   Chest.SetupShop case 21 酒保双货币表（Chest.cs:2941-3141）
//   纯数据/纯函数断言：不建 Game/World。
import { describe, it, expect } from 'vitest';
import shopstockJson from '../src/data/vanilla-shopstock.json';
import { expectedPrices } from '../src/stats/SellChain';
import {
  countDefenderMedals, spendDefenderMedals, medalShopPrice,
  DEFENDER_MEDAL_ITEM_ID, DEFENDER_MEDAL_CAP,
} from '../src/stats/DefenderMedals';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { vanillaIdOfItem } from '../src/stats/Shimmer';

const SHOPS = (shopstockJson as {
  shops: Record<string, Array<{ id: number; price: number | null; cond: string | null; customPrice?: number; currency?: 'DefenderMedals' }>>;
}).shops;

/** 测试槽位构造：勋章按内部 item id 入格 */
const medalId = ITEM_BY_KEY[`vi_${DEFENDER_MEDAL_ITEM_ID}_DefenderMedal`];
function slots(...stacks: number[]): Array<{ id: number; stack: number } | null> {
  const out: Array<{ id: number; stack: number } | null> = Array(50).fill(null);
  stacks.forEach((n, i) => { if (n > 0) out[i] = { id: medalId, stack: n }; });
  return out;
}

describe('酒保勋章表提取（Chest.cs case 21 :2963-3128）', () => {
  const tavern = SHOPS['550'];
  const medals = tavern.filter((e) => e.currency === 'DefenderMedals');

  it('勋章条目 37 条（1 熔炉 + 4 T1 杖 + 4 T2 杖 + 4 T3 杖 + 12 甲件 + 12 配饰）', () => {
    expect(medals.length).toBe(37);
    expect(medals.filter((e) => e.customPrice === 5).map((e) => e.id).sort((a, b) => a - b))
      .toEqual([3818, 3824, 3829, 3832]);
    expect(medals.filter((e) => e.customPrice === 15 && e.id >= 3818).map((e) => e.id).sort((a, b) => a - b))
      .toEqual([3819, 3825, 3830, 3833]);
    expect(medals.filter((e) => e.customPrice === 15 && e.id < 3818).map((e) => e.id).sort((a, b) => a - b))
      .toEqual([3797, 3798, 3799, 3800, 3801, 3802, 3803, 3804, 3805, 3806, 3807, 3808]);
    expect(medals.filter((e) => e.customPrice === 60).map((e) => e.id).sort((a, b) => a - b))
      .toEqual([3820, 3826, 3831, 3834]);
    expect(medals.filter((e) => e.customPrice === 50).map((e) => e.id).sort((a, b) => a - b))
      .toEqual([3813, 3871, 3872, 3873, 3874, 3875, 3876, 3877, 3878, 3879, 3880, 3881, 3882]);
  });

  it('守卫者熔炉 3813 = 50 勋章（:2963-2965）；T1 杖 5 / T2 杖 15 / T3 杖 60', () => {
    expect(tavern.find((e) => e.id === 3813)).toMatchObject({ customPrice: 50, currency: 'DefenderMedals' });
    expect(tavern.find((e) => e.id === 3818)).toMatchObject({ customPrice: 5, currency: 'DefenderMedals' });
    expect(tavern.find((e) => e.id === 3819)).toMatchObject({ customPrice: 15, currency: 'DefenderMedals' });
    expect(tavern.find((e) => e.id === 3820)).toMatchObject({ customPrice: 60, currency: 'DefenderMedals' });
  });

  it('门档：T2 杖/甲件 = hardMode&&downedMechBossAny，T3 杖/DD2 配饰 = hardMode&&downedGolemBoss（:2984-3001/:3003-3128）', () => {
    expect(tavern.find((e) => e.id === 3819)?.cond).toBe('hardMode&&downedMechBossAny');
    expect(tavern.find((e) => e.id === 3800)?.cond).toBe('hardMode&&downedMechBossAny');
    expect(tavern.find((e) => e.id === 3820)?.cond).toBe('hardMode&&downedGolemBoss');
    expect(tavern.find((e) => e.id === 3871)?.cond).toBe('hardMode&&downedGolemBoss');
    // T1 杖 + 熔炉 + 永恒水晶 + 水晶底座 + 麦酒无条件
    expect(tavern.find((e) => e.id === 3818)?.cond).toBeNull();
    expect(tavern.find((e) => e.id === 3813)?.cond).toBeNull();
  });

  it('永恒水晶 3828 条目在表（三档 shopCustomPrice 运行时直判，提取器留空：:2947-2959）', () => {
    const crystal = tavern.find((e) => e.id === 3828);
    expect(crystal).toBeDefined();
    expect(crystal!.currency).toBeUndefined();   // 铜币条目（三档铂/银价，非勋章）
  });

  it('勋章货币标记不外溢：其余 22 家店零 currency 条目', () => {
    for (const [npc, stock] of Object.entries(SHOPS)) {
      if (npc === '550') continue;
      expect(stock.filter((e) => e.currency !== undefined).length).toBe(0);
    }
  });
});

describe('GetStoreValue 优先级（Item.cs:49492-49500）', () => {
  it('勋章条目：shopCustomPrice 优先于 item.value（GetStoreValue → BuyItem(price, currency) 枚数直比）', () => {
    // 3813 熔炉：item.value = 100000 铜，但勋章条目买价 = 50 枚
    const e = SHOPS['550'].find((s) => s.id === 3813)!;
    expect(e.price).toBe(100000);
    expect(medalShopPrice(e.customPrice, e.price ?? 0)).toBe(50);
  });

  it('无 shopCustomPrice 条目回落 item.value', () => {
    expect(medalShopPrice(undefined, 2500)).toBe(2500);
  });

  it('铜币条目买价照走 GetItemExpectedPrice 主链（折扣/快乐度乘区参与）', () => {
    // 3816 水晶底座 value=10000：无 customPrice → 快乐度 1.2 × → 12000
    expect(expectedPrices(10000, { priceAdjustment: 1.2 }).buying).toBe(12000);
  });
});

describe('勋章计数/扣款（CustomCurrencySystem 1:1）', () => {
  it('CountCurrency：多槽合计（:26-47）', () => {
    expect(countDefenderMedals(slots(10, 0, 40))).toBe(50);
  });

  it('≥999 截断到 CurrencyCap（CustomCurrencyManager.cs:17 单币 cap 999）', () => {
    expect(countDefenderMedals(slots(999, 500))).toBe(DEFENDER_MEDAL_CAP);
    expect(countDefenderMedals(slots(600, 600))).toBe(999);
  });

  it('非勋章物品不计（勋章 3817 以外全跳过）', () => {
    const s = slots(30);
    s[5] = { id: ITEM_BY_KEY['vi_158_LuckyHorseshoe'] ?? s[5]!.id, stack: 99 };
    expect(countDefenderMedals(s)).toBe(30);
  });

  it('TryPurchasing：足额扣款，槽序贪心、清空置 null（:26-74）', () => {
    const s = slots(3, 30);
    const r = spendDefenderMedals(s, 5);
    expect(r).not.toBeNull();
    expect(s[0]).toBeNull();            // 首槽 3 枚扣空 → SetDefaults(0)
    expect(s[1]!.stack).toBe(28);       // 次槽补 2
  });

  it('不足拒付：CountCurrency 门口语义（< price → false，不部分扣）', () => {
    const s = slots(4);
    // 门口先 count 校验（Game.npcShopBuy 同序）；直呼 spend 亦应全额兜底失败
    expect(countDefenderMedals(s) < 5).toBe(true);
    const before = JSON.stringify(s);
    spendDefenderMedals(s, 5);
    expect(JSON.stringify(s)).toBe(before);   // 余款未尽 → 原版全量回滚等价（未变更）
  });

  it('精确清空：50 枚买 50 → 全槽置 null', () => {
    const s = slots(20, 30);
    expect(spendDefenderMedals(s, 50)).not.toBeNull();
    expect(s.every((x) => x === null)).toBe(true);
  });
});

describe('勋章物品注册链', () => {
  it('vi_3817_DefenderMedal 已注册且 vid 反查闭合（掉落→背包→计数全链）', () => {
    expect(medalId).toBeDefined();
    expect(vanillaIdOfItem(medalId)).toBe(DEFENDER_MEDAL_ITEM_ID);
    // maxStack：1456 默认 9999（case 3817 无覆盖，VANILLA_MAX_STACK 表仅 11 例外）
    expect(ITEM_DEFS[medalId].maxStack).toBe(9999);
  });
});
