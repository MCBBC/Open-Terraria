// 钱币单轨回归(vi_71-74;本地 coin_* 已退役)。
// 覆盖:COIN_KEYS 真源/钱币槽归属/100 进位/面额档 maxStack(71-73=100,74=9999)/键零引用。
import { describe, it, expect } from 'vitest';
import { COIN_KEYS, COIN_VALUES, COIN_START, coinIndexOf, Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

describe('钱币单轨(vi_71-74)', () => {
  it('COIN_KEYS 四键全是 vi_ 原版钱币', () => {
    expect(COIN_KEYS).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(COIN_KEYS[i]).toBe(VANILLA_ITEM_KEY_BY_ID[71 + i]);
      expect(ITEM_BY_KEY[COIN_KEYS[i]]).toBeDefined();
    }
    expect(COIN_VALUES).toEqual([1, 100, 10000, 1000000]);
    // 面额档堆叠上限(src/data/items.ts:84-85 VANILLA_MAX_STACK,commit b8164728):
    // 铜/银/金(71-73)=100——DoCoins 升位门只认 71-73(Player.cs:38570);
    // 白金 74 无覆盖 = 1456/1457 同值默认 9999(1.4.4 堆叠改制,手写 maxStack 不生效)
    for (let i = 0; i < 4; i++) {
      expect(ITEM_DEFS[ITEM_BY_KEY[COIN_KEYS[i]]].maxStack).toBe(i < 3 ? 100 : 9999);
    }
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

  it('100 进位:铜满 100 升银(逐堆全升+溢出币进背包,commit a3c91495)', () => {
    const copper = ITEM_BY_KEY[COIN_KEYS[0]];
    const silver = ITEM_BY_KEY[COIN_KEYS[1]];
    // 场景A:单次拾取恰好满 100 → 合并后即 DoCoins(src/items/Inventory.ts:300-308
    // 钱币格循环"填→转",修"合并恰好满 100 被调用点 count>0 门跳过"2026-08-13)
    // → 原位升 1 银,其余钱币格不动
    const invA = new Inventory();
    expect(invA.add(copper, 100)).toBe(0);
    expect(invA.slots[COIN_START]?.id).toBe(silver);
    expect(invA.slots[COIN_START]?.stack).toBe(1);
    expect(invA.slots[COIN_START + 1]).toBeNull();

    // 场景B:四格全满铜(各 100)再 +1 → doCoins(src/items/Inventory.ts:370-395)
    // 扫 0-53 逐堆升位:四堆铜全变银并合并成 50 槽一堆银×4(51-53 清空);
    // 触发币钱币区放不下 → 溢出走背包合并/空格(Inventory.ts:301,:38701+
    // 通用路径——原版溢出币进 0-49 非丢弃,旧"left=1 不入位"语义已废弃)
    const inv = new Inventory();
    for (let i = 0; i < 4; i++) inv.slots[COIN_START + i] = { id: copper, stack: 100 };
    const left = inv.add(copper, 1);
    expect(left).toBe(0);
    expect(inv.slots[0]?.id).toBe(copper); // 触发币落背包首空格(fillRange 升序)
    expect(inv.slots[0]?.stack).toBe(1);
    expect(inv.slots[COIN_START]?.id).toBe(silver);
    expect(inv.slots[COIN_START]?.stack).toBe(4); // 4×100 铜全部升位合并
    expect(inv.slots[COIN_START + 1]).toBeNull(); // 51-53 清空(升位合并源)
    expect(inv.slots[COIN_START + 3]).toBeNull();
  });

  it('全库无本地 coin_* 字面量(经 item-retirement 零引用扫描覆盖,此处仅快速断言)',
    () => {
      // 同文件首个用例已断言 COIN_KEYS 全 vi_;重模块加载断言曾因 5s 超时移除
      expect(COIN_KEYS.every((k) => /^vi_/.test(k))).toBe(true);
    });
});
