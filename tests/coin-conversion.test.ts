// 钱币满 100 自动升级（Player.DoCoins :38573-38589）——"满 100 铜不转银"回归
// （根因：add() 旧 `count > 0` 门在恰好满 100 时跳过转换）
import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';

const COPPER = ITEM_BY_KEY['vi_71_CopperCoin'];
const SILVER = ITEM_BY_KEY['vi_72_SilverCoin'];
const GOLD = ITEM_BY_KEY['vi_73_GoldCoin'];
const PLAT = ITEM_BY_KEY['vi_74_PlatinumCoin'];
const face = [1, 100, 10000, 1000000];

const totalCopper = (inv: Inventory) =>
  [COPPER, SILVER, GOLD, PLAT].reduce((sum, id, k) => sum + inv.countOf(id) * face[k], 0);

describe('DoCoins 满额升级（拾取链）', () => {
  it('恰好满 100 铜 → 转 1 银（旧 count>0 门跳过的场景）', () => {
    const inv = new Inventory();
    expect(inv.add(COPPER, 100)).toBe(0);
    expect(inv.countOf(COPPER)).toBe(0);
    expect(inv.countOf(SILVER)).toBe(1);
  });

  it('分批拾取到 100 → 同样转银（50+50）', () => {
    const inv = new Inventory();
    inv.add(COPPER, 50);
    inv.add(COPPER, 50);
    expect(inv.countOf(COPPER)).toBe(0);
    expect(inv.countOf(SILVER)).toBe(1);
  });

  it('10000 铜 → 1 金（链式：铜→银→金）', () => {
    const inv = new Inventory();
    inv.add(COPPER, 10000);
    expect(inv.countOf(COPPER)).toBe(0);
    expect(inv.countOf(SILVER)).toBe(0);
    expect(inv.countOf(GOLD)).toBe(1);
  });

  it('面额守恒：总额不变（99+1 边界 / 大额混合）', () => {
    for (const n of [99, 100, 101, 2333, 10000, 123456]) {
      const inv = new Inventory();
      expect(inv.add(COPPER, n)).toBe(0);
      expect(totalCopper(inv)).toBe(n);
    }
  });

  it('银满 100 → 金（直接塞银币）', () => {
    const inv = new Inventory();
    inv.add(SILVER, 150);
    expect(inv.countOf(SILVER)).toBe(50);
    expect(inv.countOf(GOLD)).toBe(1);
  });

  it('铂币不升级（DoCoins 只对 71-73,白金无上限 :38570）', () => {
    const inv = new Inventory();
    inv.add(PLAT, 100);
    expect(inv.countOf(PLAT)).toBe(100);
  });

  it('maxStack 对表：铜银金=100 / 铂=9999（Item.cs case 71-74）', () => {
    expect(ITEM_DEFS[COPPER].maxStack).toBe(100);
    expect(ITEM_DEFS[SILVER].maxStack).toBe(100);
    expect(ITEM_DEFS[GOLD].maxStack).toBe(100);
    expect(ITEM_DEFS[PLAT].maxStack).toBe(9999);
  });
});
