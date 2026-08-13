// 钱币单轨回归(vi_71-74;本地 coin_* 已退役)。
// 覆盖:COIN_KEYS 真源/钱币槽归属/100 进位/maxStack=100/键零引用。
import { describe, it, expect } from 'vitest';
import { COIN_KEYS, COIN_VALUES, COIN_START, coinIndexOf, Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

describe('钱币单轨(vi_71-74)', () => {
  it('COIN_KEYS 四键全是 vi_ 原版钱币', () => {
    expect(COIN_KEYS).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(COIN_KEYS[i]).toBe(VANILLA_ITEM_KEY_BY_ID[71 + i]);
      expect(ITEM_BY_KEY[COIN_KEYS[i]]).toBeDefined();
    }
    expect(COIN_VALUES).toEqual([1, 100, 10000, 1000000]);
  });

  it('钱币槽归属:vi_ 钱币进 50-53 槽,非钱币不进', () => {
    const inv = new Inventory();
    const copper = ITEM_BY_KEY[COIN_KEYS[0]];
    const left = inv.add(copper, 50);
    expect(left).toBe(0);
    expect(inv.slots[COIN_START]?.id).toBe(copper);
    expect(coinIndexOf(copper)).toBe(0);
    expect(coinIndexOf(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2]])).toBe(-1); // 泥土不是钱币
  });

  it('100 进位:铜 100 满 → 升银 1(依赖 vi_ 钱 maxStack=100)', () => {
    const inv = new Inventory();
    const silver = ITEM_BY_KEY[COIN_KEYS[1]];
    // 晋升仅在钱币区放不下时触发(DoCoins :38573 语义):四格全满再溢出
    for (let i = 0; i < 4; i++) inv.slots[COIN_START + i] = { id: ITEM_BY_KEY[COIN_KEYS[0]], stack: 100 };
    const left = inv.add(ITEM_BY_KEY[COIN_KEYS[0]], 1);
    expect(left).toBe(1); // 触发币本身不入位(DoCoins 既有怪癖,迁移前同语义)
    // 晋升生效:50 格满铜被消耗换 1 银(其余格铜币不受影响——逐格判同面额)
    expect(inv.slots[COIN_START]?.id).toBe(silver);
    expect(inv.slots[COIN_START]?.stack).toBe(1);
    expect(inv.slots[COIN_START + 1]?.stack).toBe(100); // 51-53 铜币原样
  });

  it('全库无本地 coin_* 字面量(经 item-retirement 零引用扫描覆盖,此处仅快速断言)',
    () => {
      // 同文件首个用例已断言 COIN_KEYS 全 vi_;重模块加载断言曾因 5s 超时移除
      expect(COIN_KEYS.every((k) => /^vi_/.test(k))).toBe(true);
    });
});
